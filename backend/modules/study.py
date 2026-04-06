import base64
import json
import os
import pathlib
import random
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date as date_cls
from typing import List, Literal, Optional

import sqlalchemy as sa
from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse


def setup_study_module(app, engine, metadata):
    sessions = sa.Table(
        "sessions",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("duration", sa.Integer, nullable=False),
    )
    review_sessions = sa.Table(
        "review_sessions",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("duration", sa.Integer, nullable=False),
    )
    words = sa.Table(
        "words",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("word", sa.String(255), nullable=False),
        sa.Column("meaning", sa.Text, nullable=False, server_default=""),
        sa.Column("sentence", sa.Text, nullable=False, server_default=""),
        sa.Column("date", sa.Date, nullable=False),
    )
    word_stats = sa.Table(
        "word_stats",
        metadata,
        sa.Column(
            "word_id",
            sa.Integer,
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("yes_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("no_count", sa.Integer, nullable=False, server_default="1"),
    )
    word_examples = sa.Table(
        "word_examples",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "word_id",
            sa.Integer,
            sa.ForeignKey("words.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("example", sa.Text, nullable=False),
    )
    topics = sa.Table(
        "topics",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
    )
    back_schedules = sa.Table(
        "back_schedules",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    class Session(BaseModel):
        date: date_cls
        duration: int = Field(gt=0, le=1440)

    class ReviewSession(BaseModel):
        date: date_cls
        duration: int = Field(gt=0, le=1440)

    class WordCreate(BaseModel):
        word: str = Field(min_length=1)
        meaning: str = ""
        sentence: str = ""
        examples: List[str] = Field(default_factory=list)
        date: Optional[date_cls] = None

    class Word(BaseModel):
        id: int
        word: str
        meaning: str = ""
        sentence: str = ""
        date: date_cls
        examples: List[str]
        yes_count: int = 0
        no_count: int = 1

    class WordReviewUpdate(BaseModel):
        outcome: Literal["yes", "no"]

    class WordLookupRequest(BaseModel):
        words: List[str] = Field(default_factory=list)

    class WordLookupResponse(BaseModel):
        existing_words: List[str]

    class WordPronunciationResponse(BaseModel):
        word: str
        audio_url: str = ""
        source: str = ""

    class WordStats(BaseModel):
        word_id: int
        yes_count: int
        no_count: int

    class TopicCreate(BaseModel):
        name: str = Field(min_length=1)

    class Topic(BaseModel):
        id: int
        name: str

    class BackScheduleCreate(BaseModel):
        name: str = Field(min_length=1)
        schedule: dict

    class BackSchedule(BaseModel):
        id: int
        name: str
        schedule: dict

    class BackScheduleUpdate(BaseModel):
        name: Optional[str] = None
        schedule: Optional[dict] = None

    class ScanWord(BaseModel):
        word: str = ""
        ipa: str = ""
        meaning_en: str = ""
        meaning_zh: str = ""
        common_meaning_en: str = ""
        common_meaning_zh: str = ""
        roots: str = ""
        memory_connections: str = ""
        nuance: str = ""
        sentence_en: str = ""
        sentence_zh: str = ""
        confidence: float = 0

    class ScanWordsResponse(BaseModel):
        words: List[ScanWord]

    class WordPromptLabRequest(BaseModel):
        word: str = Field(min_length=1)
        sentence: str = Field(min_length=1)
        prompt: str = ""

    class WordPromptLabResponse(BaseModel):
        word: str
        sentence: str
        prompt: str
        rendered_prompt: str
        output: str
        model: str

    def iter_streamed_word_objects(text: str):
        words_key_index = text.find('"words"')
        if words_key_index < 0:
            return

        array_start = text.find("[", words_key_index)
        if array_start < 0:
            return

        index = array_start + 1
        while index < len(text):
            while index < len(text) and text[index] in " \n\r\t,":
                index += 1
            if index >= len(text) or text[index] == "]":
                return
            if text[index] != "{":
                index += 1
                continue

            start = index
            depth = 0
            in_string = False
            escaped = False
            while index < len(text):
                char = text[index]
                if in_string:
                    if escaped:
                        escaped = False
                    elif char == "\\":
                        escaped = True
                    elif char == '"':
                        in_string = False
                else:
                    if char == '"':
                        in_string = True
                    elif char == "{":
                        depth += 1
                    elif char == "}":
                        depth -= 1
                        if depth == 0:
                            yield text[start : index + 1]
                            index += 1
                            break
                index += 1
            else:
                return

    def normalize_scan_word_payload(item: dict):
        word = str(item.get("word") or "").strip()
        if not word:
            return None

        return {
            "word": word,
            "ipa": str(item.get("ipa") or "").strip(),
            "meaning_en": str(item.get("meaning_en") or "").strip(),
            "meaning_zh": str(item.get("meaning_zh") or "").strip(),
            "common_meaning_en": str(item.get("common_meaning_en") or "").strip(),
            "common_meaning_zh": str(item.get("common_meaning_zh") or "").strip(),
            "roots": str(item.get("roots") or "").strip(),
            "memory_connections": str(item.get("memory_connections") or "").strip(),
            "nuance": str(item.get("nuance") or "").strip(),
            "sentence_en": str(item.get("sentence_en") or "").strip(),
            "sentence_zh": str(item.get("sentence_zh") or "").strip(),
            "confidence": max(0, min(1, float(item.get("confidence") or 0))),
        }

    def build_scan_words_prompt():
        return (
            "Extract only the highlighted, circled, or underlined English words "
            "from this magazine photo. Handle one word at a time. For each word, "
            "return IPA, the meaning used in this sentence in English, the meaning used in this sentence in Chinese, "
            "the common everyday meaning in English when it differs, the common everyday meaning in Chinese when it differs, "
            "roots or meaningful "
            "parts explained through memorable related words, memory connections, usage nuance, "
            "the full source sentence in English, and the sentence meaning in Chinese. "
            "Return the dictionary headword for `word`, not the surface form from the sentence, "
            "when the marked text is an inflected form such as a plural, tense change, or participle. "
            "For example, use read instead of reading when reading is the verb form, and use bury "
            "instead of buried. Use that normalized dictionary form for `word`, IPA, meanings, roots, "
            "memory connections, and nuance. Keep `sentence_en` exactly as it appears in the image, "
            "including the original surface form in the sentence. If a marked word is already a normal "
            "dictionary headword in its own right, keep it unchanged. If the photo or OCR contains an "
            "obvious spelling error but the intended English word is clear from the text, correct it to "
            "the intended dictionary headword. "
            "For `meaning_en` and `meaning_zh`, explain the exact sense used in the source sentence even if it is literary, "
            "technical, or rare. If that sentence-level sense differs from the ordinary everyday meaning, fill "
            "`common_meaning_en` and `common_meaning_zh` with the common meaning. If the sentence already uses the common "
            "meaning, leave the common meaning fields empty. "
            "For roots, do not give formal etymology labels by themselves. Instead, break "
            "the word into parts when useful and teach each part through a small word-family map. "
            "For each useful part, include 2 or 3 familiar family words, explain the shared idea, and then "
            "connect that shared idea back to the target word. Do not stop at glosses like auto = self or "
            "crat = ruler. Show why those parts matter through nearby words a learner may already know. "
            "For example, auto should be explained through common words like automobile and autograph to show "
            "the shared idea of self or own, and crat should be explained through words like democrat and "
            "bureaucrat to show the shared idea of rule, government, or power. For autocrat-like words, a good "
            "explanation teaches each part separately; a weak explanation only says self-ruler. Prefer the "
            "family-based explanation over a loose slogan or a generic image. "
            "If roots are not useful, explain spelling or sound connections that help memory. "
            "Focus on each marked word individually. "
            "If no marked words are visible, return an empty list."
        )

    def build_word_prompt_lab_default_prompt():
        return (
            "You are helping an English learner learn one word inside one sentence.\n"
            "Return concise Markdown with these short sections:\n"
            "1. Meaning used here: explain the exact meaning of the word in this sentence in plain English and Chinese.\n"
            "2. Common meaning: if the sentence uses a specialized, literary, technical, or rare sense, also give the most common everyday meaning in English and Chinese. If the sentence already uses the common meaning, say that clearly.\n"
            "3. Nuance: briefly explain why this word fits here and, if useful, how it differs from a close alternative.\n"
            "4. Memory hook: give 2 strong memory hooks. Prefer explanation-based hooks over decorative ones.\n"
            "For the first hook, if the word breaks into useful parts, use a Word-family map with one mini-block per useful part.\n"
            "Each mini-block must contain: part, familiar family words, shared idea, and link to target word.\n"
            "Example structure:\n"
            "- part: auto\n"
            "  family words: automobile, autograph\n"
            "  shared idea: self / one's own\n"
            "  link to target: in autocrat, the ruler keeps power to self\n"
            "- part: crat\n"
            "  family words: democrat, bureaucrat\n"
            "  shared idea: rule / government / power\n"
            "  link to target: in autocrat, rule is concentrated in one person\n"
            "A bad answer is: auto = self, crat = ruler. A good answer teaches through the family words.\n"
            "For the second hook, add an image-based or situation-based hook only if it adds something beyond the word-family explanation.\n"
            "5. Quick recall: end with one short self-test question.\n"
            "Keep the tone concrete and learner-friendly."
        )

    def render_word_prompt_lab_prompt(prompt: str, word: str, sentence: str) -> str:
        prompt_template = (prompt or "").strip() or build_word_prompt_lab_default_prompt()
        has_word_placeholder = "{word}" in prompt_template
        has_sentence_placeholder = "{sentence}" in prompt_template

        rendered = prompt_template.replace("{word}", word.strip()).replace(
            "{sentence}",
            sentence.strip(),
        )

        prompt_context = []
        if not has_word_placeholder:
            prompt_context.append(f"Target word: {word.strip()}")
        if not has_sentence_placeholder:
            prompt_context.append(f"Sentence: {sentence.strip()}")

        if prompt_context:
            rendered = f"{rendered}\n\n" + "\n".join(prompt_context)

        return rendered

    def ensure_study_schema():
        inspector = sa.inspect(engine)
        if "words" not in inspector.get_table_names():
            return

        word_columns = {column["name"] for column in inspector.get_columns("words")}
        with engine.begin() as conn:
            if "meaning" not in word_columns:
                conn.execute(sa.text("ALTER TABLE words ADD COLUMN meaning TEXT NOT NULL DEFAULT ''"))
            if "sentence" not in word_columns:
                conn.execute(sa.text("ALTER TABLE words ADD COLUMN sentence TEXT NOT NULL DEFAULT ''"))

            if "meaning" not in word_columns or "sentence" not in word_columns:
                rows = conn.execute(sa.select(words.c.id)).all()
                example_rows = conn.execute(
                    sa.select(word_examples.c.word_id, word_examples.c.example).order_by(word_examples.c.id)
                ).all()
                examples_by_word_id = {}
                for word_id, example in example_rows:
                    examples_by_word_id.setdefault(word_id, []).append(example)

                for row in rows:
                    parsed_meaning = ""
                    parsed_sentence = ""
                    for example in examples_by_word_id.get(row.id, []):
                        value = (example or "").strip()
                        lower_value = value.lower()
                        if not parsed_meaning and lower_value.startswith("meaning:"):
                            parsed_meaning = value.split(":", 1)[1].strip()
                        elif not parsed_sentence and lower_value.startswith("sentence:"):
                            parsed_sentence = value.split(":", 1)[1].strip()

                    if parsed_meaning or parsed_sentence:
                        conn.execute(
                            sa.update(words)
                            .where(words.c.id == row.id)
                            .values(meaning=parsed_meaning, sentence=parsed_sentence)
                        )

    ensure_study_schema()

    def sanitize_word_list(items: List[str]) -> List[str]:
        cleaned = []
        for item in items or []:
            if not isinstance(item, str):
                continue
            value = item.strip().lower()
            if value and all(ch.isalpha() or ch in {"'", "-"} for ch in value):
                cleaned.append(value)

        seen = set()
        result = []
        for item in cleaned:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result

    def load_common_words() -> List[str]:
        default_path = (
            pathlib.Path(__file__).resolve().parents[2]
            / "frontend"
            / "src"
            / "features"
            / "learning"
            / "data"
            / "common-words.json"
        )
        source_path = pathlib.Path(os.getenv("COMMON_WORDS_FILE", str(default_path)))
        if not source_path.exists():
            return []

        try:
            text = source_path.read_text(encoding="utf-8")
            raw = json.loads(text)
        except Exception:
            return []

        if not isinstance(raw, list):
            return []

        return sanitize_word_list([str(item) for item in raw])

    common_words_list = load_common_words()

    @app.post("/api/sessions", response_model=Session)
    def add_session(session: Session):
        with engine.begin() as conn:
            conn.execute(sa.insert(sessions).values(date=session.date, duration=session.duration))
        return session

    @app.get("/api/sessions", response_model=List[Session])
    def list_sessions():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(sessions.c.date, sessions.c.duration).order_by(sessions.c.date.desc())
            ).all()
        return [{"date": row.date, "duration": row.duration} for row in rows]

    @app.post("/api/review_sessions", response_model=ReviewSession)
    def add_review_session(session: ReviewSession):
        with engine.begin() as conn:
            conn.execute(
                sa.insert(review_sessions).values(date=session.date, duration=session.duration)
            )
        return session

    @app.get("/api/review_sessions", response_model=List[ReviewSession])
    def list_review_sessions():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(review_sessions.c.date, review_sessions.c.duration).order_by(
                    review_sessions.c.date.desc()
                )
            ).all()
        return [{"date": row.date, "duration": row.duration} for row in rows]

    @app.post("/api/learning/scan-words", response_model=ScanWordsResponse)
    async def scan_words_image(image: UploadFile = File(...)):
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not set")

        content_type = image.content_type or ""
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Please upload an image")

        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty")
        if len(image_bytes) > 12 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be 12MB or smaller")

        from openai import AuthenticationError, OpenAI, OpenAIError

        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
        data_url = f"data:{content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"

        schema = {
            "name": "magazine_words",
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "words": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "word": {"type": "string"},
                                "ipa": {"type": "string"},
                                "meaning_en": {"type": "string"},
                                "meaning_zh": {"type": "string"},
                                "common_meaning_en": {"type": "string"},
                                "common_meaning_zh": {"type": "string"},
                                "roots": {"type": "string"},
                                "memory_connections": {"type": "string"},
                                "nuance": {"type": "string"},
                                "sentence_en": {"type": "string"},
                                "sentence_zh": {"type": "string"},
                                "confidence": {"type": "number"},
                            },
                            "required": [
                                "word",
                                "ipa",
                                "meaning_en",
                                "meaning_zh",
                                "common_meaning_en",
                                "common_meaning_zh",
                                "roots",
                                "memory_connections",
                                "nuance",
                                "sentence_en",
                                "sentence_zh",
                                "confidence",
                            ],
                        },
                    }
                },
                "required": ["words"],
            },
            "strict": True,
        }

        try:
            response = client.responses.create(
                model=model,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": build_scan_words_prompt(),
                            },
                            {
                                "type": "input_image",
                                "image_url": data_url,
                            },
                        ],
                    }
                ],
                text={"format": {"type": "json_schema", **schema}},
                max_output_tokens=4000,
            )
        except AuthenticationError as exc:
            raise HTTPException(status_code=401, detail="Invalid OpenAI API key") from exc
        except OpenAIError as exc:
            raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}") from exc

        output_text = (getattr(response, "output_text", "") or "").strip()
        if not output_text:
            response_status = getattr(response, "status", "unknown")
            incomplete_details = getattr(response, "incomplete_details", None)
            print(
                "scan_words_image empty output",
                {"status": response_status, "incomplete_details": incomplete_details},
            )
            raise HTTPException(
                status_code=502,
                detail="OpenAI returned an empty response. Please try again.",
            )

        try:
            payload = json.loads(output_text)
        except json.JSONDecodeError as exc:
            normalized_output = re.sub(r"^```(?:json)?\s*|\s*```$", "", output_text).strip()
            json_match = re.search(r"\{.*\}", normalized_output, re.DOTALL)
            if json_match:
                try:
                    payload = json.loads(json_match.group(0))
                except json.JSONDecodeError:
                    payload = None
            else:
                payload = None

            if payload is None:
                recovered_words = []
                for word_object in iter_streamed_word_objects(normalized_output):
                    try:
                        parsed_word = json.loads(word_object)
                    except json.JSONDecodeError:
                        continue
                    cleaned_word = normalize_scan_word_payload(parsed_word)
                    if cleaned_word:
                        recovered_words.append(cleaned_word)

                response_status = getattr(response, "status", "unknown")
                incomplete_details = getattr(response, "incomplete_details", None)
                print(
                    "scan_words_image invalid json",
                    {
                        "status": response_status,
                        "incomplete_details": incomplete_details,
                        "recovered_words": len(recovered_words),
                        "output": repr(output_text[:1000]),
                    },
                )
                if recovered_words:
                    return {"words": recovered_words}
                raise HTTPException(
                    status_code=502,
                    detail="OpenAI returned invalid JSON. Please try again.",
                ) from exc

        words_payload = payload.get("words", []) if isinstance(payload, dict) else []
        cleaned_words = []
        for item in words_payload:
            if not isinstance(item, dict):
                continue
            cleaned_word = normalize_scan_word_payload(item)
            if not cleaned_word:
                continue
            cleaned_words.append(cleaned_word)

        return {"words": cleaned_words}

    @app.post("/api/learning/scan-words/stream")
    async def stream_scan_words_image(image: UploadFile = File(...)):
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not set")

        content_type = image.content_type or ""
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Please upload an image")

        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty")
        if len(image_bytes) > 12 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Image must be 12MB or smaller")

        from openai import AuthenticationError, OpenAI, OpenAIError

        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
        data_url = f"data:{content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"

        schema = {
            "name": "magazine_words",
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "words": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "word": {"type": "string"},
                                "ipa": {"type": "string"},
                                "meaning_en": {"type": "string"},
                                "meaning_zh": {"type": "string"},
                                "common_meaning_en": {"type": "string"},
                                "common_meaning_zh": {"type": "string"},
                                "roots": {"type": "string"},
                                "memory_connections": {"type": "string"},
                                "nuance": {"type": "string"},
                                "sentence_en": {"type": "string"},
                                "sentence_zh": {"type": "string"},
                                "confidence": {"type": "number"},
                            },
                            "required": [
                                "word",
                                "ipa",
                                "meaning_en",
                                "meaning_zh",
                                "common_meaning_en",
                                "common_meaning_zh",
                                "roots",
                                "memory_connections",
                                "nuance",
                                "sentence_en",
                                "sentence_zh",
                                "confidence",
                            ],
                        },
                    }
                },
                "required": ["words"],
            },
            "strict": True,
        }

        def stream_events():
            def emit(payload: dict):
                return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

            yield emit({"type": "start"})

            try:
                stream = client.responses.create(
                    model=model,
                    input=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": build_scan_words_prompt(),
                                },
                                {
                                    "type": "input_image",
                                    "image_url": data_url,
                                },
                            ],
                        }
                    ],
                    text={"format": {"type": "json_schema", **schema}},
                    max_output_tokens=4000,
                    stream=True,
                )
            except AuthenticationError:
                yield emit({"type": "error", "detail": "Invalid OpenAI API key"})
                return
            except OpenAIError as exc:
                yield emit({"type": "error", "detail": f"OpenAI request failed: {exc}"})
                return

            buffer = ""
            emitted_count = 0
            try:
                for event in stream:
                    if getattr(event, "type", "") == "response.output_text.delta":
                        buffer += getattr(event, "delta", "") or ""
                        objects = list(iter_streamed_word_objects(buffer))
                        while emitted_count < len(objects):
                            try:
                                parsed_word = json.loads(objects[emitted_count])
                            except json.JSONDecodeError:
                                break
                            emitted_count += 1
                            cleaned_word = normalize_scan_word_payload(parsed_word)
                            if cleaned_word:
                                yield emit({"type": "word", "word": cleaned_word})
                    elif getattr(event, "type", "") == "response.completed":
                        break
            except OpenAIError as exc:
                yield emit({"type": "error", "detail": f"OpenAI stream failed: {exc}"})
                return

            yield emit({"type": "done"})

        return StreamingResponse(
            stream_events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.post("/api/learning/prompt-lab", response_model=WordPromptLabResponse)
    def run_word_prompt_lab(payload: WordPromptLabRequest):
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not set")

        from openai import AuthenticationError, OpenAI, OpenAIError

        client = OpenAI(api_key=api_key)
        model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip() or "gpt-4.1-mini"
        rendered_prompt = render_word_prompt_lab_prompt(
            payload.prompt,
            payload.word,
            payload.sentence,
        )

        try:
            response = client.responses.create(
                model=model,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": rendered_prompt,
                            }
                        ],
                    }
                ],
                max_output_tokens=1600,
            )
        except AuthenticationError as exc:
            raise HTTPException(status_code=401, detail="Invalid OpenAI API key") from exc
        except OpenAIError as exc:
            raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}") from exc

        output_text = (getattr(response, "output_text", "") or "").strip()
        if not output_text:
            raise HTTPException(
                status_code=502,
                detail="OpenAI returned an empty response. Please try again.",
            )

        return {
            "word": payload.word.strip(),
            "sentence": payload.sentence.strip(),
            "prompt": (payload.prompt or "").strip() or build_word_prompt_lab_default_prompt(),
            "rendered_prompt": rendered_prompt,
            "output": output_text,
            "model": model,
        }

    @app.post("/api/words", response_model=Word)
    def add_word(word_input: WordCreate):
        valid_examples = [item.strip() for item in word_input.examples if item and item.strip()]
        meaning = (word_input.meaning or "").strip()
        sentence = (word_input.sentence or "").strip()
        if not valid_examples and not meaning and not sentence:
            raise HTTPException(status_code=400, detail="Please provide meaning, sentence, or examples")
        chosen_date = word_input.date or date_cls.today()
        with engine.begin() as conn:
            result = conn.execute(
                sa.insert(words).values(
                    word=word_input.word.strip(),
                    meaning=meaning,
                    sentence=sentence,
                    date=chosen_date,
                )
            )
            word_id = result.inserted_primary_key[0]
            if valid_examples:
                conn.execute(
                    sa.insert(word_examples),
                    [{"word_id": word_id, "example": example} for example in valid_examples],
                )
            conn.execute(
                sa.insert(word_stats).values(word_id=word_id, yes_count=0, no_count=1)
            )
        return {
            "id": word_id,
            "word": word_input.word.strip(),
            "meaning": meaning,
            "sentence": sentence,
            "date": chosen_date,
            "examples": valid_examples,
            "yes_count": 0,
            "no_count": 1,
        }

    @app.post("/api/words/lookup", response_model=WordLookupResponse)
    def lookup_words(payload: WordLookupRequest):
        normalized_words = sorted({
            item.strip().lower()
            for item in payload.words
            if isinstance(item, str) and item.strip()
        })
        if not normalized_words:
            return {"existing_words": []}

        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(sa.func.lower(words.c.word)).where(
                    sa.func.lower(words.c.word).in_(normalized_words)
                )
            ).all()

        return {"existing_words": sorted({row[0] for row in rows if row[0]})}

    @app.get("/api/words/pronunciation/{word}", response_model=WordPronunciationResponse)
    def get_word_pronunciation(word: str):
        normalized_word = word.strip()
        if not normalized_word:
            raise HTTPException(status_code=400, detail="Word is required")

        lookup_url = (
            "https://api.dictionaryapi.dev/api/v2/entries/en/"
            + urllib.parse.quote(normalized_word)
        )

        request = urllib.request.Request(
            lookup_url,
            headers={"User-Agent": "fos/1.0"},
        )

        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return {"word": normalized_word, "audio_url": "", "source": "dictionaryapi.dev"}
            raise HTTPException(status_code=502, detail="Pronunciation lookup failed") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=502, detail="Pronunciation lookup failed") from exc

        if not isinstance(payload, list):
            return {"word": normalized_word, "audio_url": "", "source": "dictionaryapi.dev"}

        for entry in payload:
            for phonetic in entry.get("phonetics", []) if isinstance(entry, dict) else []:
                audio_url = str(phonetic.get("audio") or "").strip()
                if audio_url.startswith("//"):
                    audio_url = "https:" + audio_url
                if audio_url:
                    return {
                        "word": normalized_word,
                        "audio_url": audio_url,
                        "source": "dictionaryapi.dev",
                    }

        return {"word": normalized_word, "audio_url": "", "source": "dictionaryapi.dev"}

    @app.get("/api/words", response_model=List[Word])
    def list_words(start: Optional[date_cls] = None, end: Optional[date_cls] = None):
        stmt = sa.select(words.c.id, words.c.word, words.c.meaning, words.c.sentence, words.c.date)
        if start is not None:
            stmt = stmt.where(words.c.date >= start)
        if end is not None:
            stmt = stmt.where(words.c.date <= end)
        stmt = stmt.order_by(words.c.date.desc(), words.c.id.desc())

        with engine.begin() as conn:
            word_rows = conn.execute(stmt).all()
            example_rows = conn.execute(
                sa.select(word_examples.c.word_id, word_examples.c.example)
            ).all()
            stats_rows = conn.execute(
                sa.select(
                    word_stats.c.word_id,
                    word_stats.c.yes_count,
                    word_stats.c.no_count,
                )
            ).all()

        examples_by_word_id = {}
        for word_id, example in example_rows:
            examples_by_word_id.setdefault(word_id, []).append(example)
        stats_by_word_id = {word_id: (yes, no) for word_id, yes, no in stats_rows}

        return [
          {
            "id": row.id,
            "word": row.word,
            "meaning": row.meaning or "",
            "sentence": row.sentence or "",
            "date": row.date,
            "examples": examples_by_word_id.get(row.id, []),
            "yes_count": stats_by_word_id.get(row.id, (0, 1))[0],
            "no_count": stats_by_word_id.get(row.id, (0, 1))[1],
          }
          for row in word_rows
        ]

    @app.post("/api/word_stats/{word_id}", response_model=WordStats)
    def update_word_stats(word_id: int, update: WordReviewUpdate):
        with engine.begin() as conn:
            exists = conn.execute(
                sa.select(word_stats.c.word_id).where(word_stats.c.word_id == word_id)
            ).first()
            if exists is None:
                conn.execute(
                    sa.insert(word_stats).values(word_id=word_id, yes_count=0, no_count=1)
                )
            if update.outcome == "yes":
                conn.execute(
                    sa.update(word_stats)
                    .where(word_stats.c.word_id == word_id)
                    .values(yes_count=word_stats.c.yes_count + 1)
                )
            else:
                conn.execute(
                    sa.update(word_stats)
                    .where(word_stats.c.word_id == word_id)
                    .values(no_count=word_stats.c.no_count + 1)
                )
            row = conn.execute(
                sa.select(word_stats.c.yes_count, word_stats.c.no_count).where(
                    word_stats.c.word_id == word_id
                )
            ).one()
        return {"word_id": word_id, "yes_count": row.yes_count, "no_count": row.no_count}

    @app.post("/api/topics", response_model=Topic)
    def add_topic(topic: TopicCreate):
        with engine.begin() as conn:
            result = conn.execute(sa.insert(topics).values(name=topic.name.strip()))
            topic_id = result.inserted_primary_key[0]
        return {"id": topic_id, "name": topic.name.strip()}

    @app.get("/api/topics", response_model=List[Topic])
    def list_topics():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(topics.c.id, topics.c.name).order_by(topics.c.id.desc())
            ).all()
        return [{"id": row.id, "name": row.name} for row in rows]

    @app.post("/api/back_schedules", response_model=BackSchedule)
    def add_back_schedule(schedule: BackScheduleCreate):
        with engine.begin() as conn:
            result = conn.execute(
                sa.insert(back_schedules).values(name=schedule.name, payload=schedule.schedule)
            )
            schedule_id = result.inserted_primary_key[0]
        return {"id": schedule_id, "name": schedule.name, "schedule": schedule.schedule}

    @app.get("/api/back_schedules", response_model=List[BackSchedule])
    def list_back_schedules():
        with engine.begin() as conn:
            rows = conn.execute(
                sa.select(
                    back_schedules.c.id,
                    back_schedules.c.name,
                    back_schedules.c.payload,
                ).order_by(back_schedules.c.id.desc())
            ).all()
        return [{"id": row.id, "name": row.name, "schedule": row.payload} for row in rows]

    @app.put("/api/back_schedules/{schedule_id}", response_model=BackSchedule)
    def update_back_schedule(schedule_id: int, update: BackScheduleUpdate):
        with engine.begin() as conn:
            values = {}
            if update.name is not None:
                values["name"] = update.name
            if update.schedule is not None:
                values["payload"] = update.schedule
            if values:
                conn.execute(
                    sa.update(back_schedules)
                    .where(back_schedules.c.id == schedule_id)
                    .values(**values)
                )
            row = conn.execute(
                sa.select(
                    back_schedules.c.id,
                    back_schedules.c.name,
                    back_schedules.c.payload,
                ).where(back_schedules.c.id == schedule_id)
            ).first()

            if row is None:
                if update.name is not None and update.schedule is not None:
                    result = conn.execute(
                        sa.insert(back_schedules).values(
                            name=update.name,
                            payload=update.schedule,
                        )
                    )
                    schedule_id = result.inserted_primary_key[0]
                    return {
                        "id": schedule_id,
                        "name": update.name,
                        "schedule": update.schedule,
                    }
                raise ValueError("Schedule not found and insufficient data to create")

        return {"id": row.id, "name": row.name, "schedule": row.payload}

    @app.get("/api/common_words", response_model=List[str])
    def get_common_words(count: int = 10):
        if not common_words_list:
            return []

        requested = max(1, min(int(count or 10), 100))
        if requested >= len(common_words_list):
            words_copy = common_words_list[:]
            random.shuffle(words_copy)
            return words_copy
        return random.sample(common_words_list, requested)
