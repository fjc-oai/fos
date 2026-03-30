import gzip
import json
import os
import pathlib
import sys
from datetime import date, datetime, time
from decimal import Decimal

import sqlalchemy as sa


ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_BACKUP_PATH = ROOT_DIR / "backups" / "neon-db-latest.json.gz"


def serialize_value(value):
    if isinstance(value, datetime):
        return {"__type": "datetime", "value": value.isoformat()}
    if isinstance(value, date):
        return {"__type": "date", "value": value.isoformat()}
    if isinstance(value, time):
        return {"__type": "time", "value": value.isoformat()}
    if isinstance(value, Decimal):
        return {"__type": "decimal", "value": str(value)}
    if isinstance(value, bytes):
        return {"__type": "bytes", "value": value.hex()}
    return value


def deserialize_value(value):
    if isinstance(value, list):
        return [deserialize_value(item) for item in value]
    if not isinstance(value, dict):
        return value

    value_type = value.get("__type")
    if value_type == "datetime":
        return datetime.fromisoformat(value["value"])
    if value_type == "date":
        return date.fromisoformat(value["value"])
    if value_type == "time":
        return time.fromisoformat(value["value"])
    if value_type == "decimal":
        return Decimal(value["value"])
    if value_type == "bytes":
        return bytes.fromhex(value["value"])

    return {key: deserialize_value(item) for key, item in value.items()}


def get_engine():
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is not set")
    return sa.create_engine(database_url, pool_pre_ping=True)


def dump_database(output_path: pathlib.Path):
    engine = get_engine()
    metadata = sa.MetaData()
    metadata.reflect(bind=engine)

    payload = {
        "format": "fos-db-backup-v1",
        "generated_at": datetime.now().astimezone().isoformat(),
        "tables": [],
    }

    with engine.begin() as conn:
        for table in metadata.sorted_tables:
            rows = conn.execute(sa.select(table)).mappings().all()
            payload["tables"].append(
                {
                    "name": table.name,
                    "columns": [column.name for column in table.columns],
                    "rows": [
                        {key: serialize_value(value) for key, value in row.items()}
                        for row in rows
                    ],
                }
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output_path, "wt", encoding="utf-8") as backup_file:
        json.dump(payload, backup_file, ensure_ascii=False, separators=(",", ":"))

    print(f"Dumped {len(payload['tables'])} tables to {output_path}")


def recover_database(input_path: pathlib.Path):
    if not input_path.exists():
        raise SystemExit(f"Backup file not found: {input_path}")

    with gzip.open(input_path, "rt", encoding="utf-8") as backup_file:
        payload = json.load(backup_file)

    if payload.get("format") != "fos-db-backup-v1":
        raise SystemExit("Unsupported backup format")

    engine = get_engine()
    metadata = sa.MetaData()
    metadata.reflect(bind=engine)

    backup_tables = payload.get("tables", [])
    table_names = [table_data["name"] for table_data in backup_tables]
    if not table_names:
        raise SystemExit("Backup does not contain any tables")

    with engine.begin() as conn:
        quoted_names = ", ".join(
            conn.dialect.identifier_preparer.quote(name) for name in table_names
        )
        conn.execute(sa.text(f"TRUNCATE TABLE {quoted_names} RESTART IDENTITY CASCADE"))

        for table_data in backup_tables:
            table = metadata.tables.get(table_data["name"])
            if table is None:
                continue

            rows = [
                {key: deserialize_value(value) for key, value in row.items()}
                for row in table_data.get("rows", [])
            ]
            if rows:
                conn.execute(sa.insert(table), rows)

    print(f"Recovered {len(table_names)} tables from {input_path}")


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_BACKUP_PATH

    if command == "dump":
        dump_database(path)
    elif command == "recover":
        recover_database(path)
    else:
        raise SystemExit(
            "Usage: python -m modules.db_backup {dump|recover} [backup_path]"
        )


if __name__ == "__main__":
    main()
