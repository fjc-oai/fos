# 3000r

## links
Render
- https://three000r-web.onrender.com
- https://dashboard.render.com/web/srv-d2shk66mcj7s73a5raeg/deploys/dep-d31q4cemcj7s738v6rr0
Neon
- https://console.neon.tech/app/projects/mute-mud-01593984/branches/br-winter-king-af7p2cux/sql-editor?database=neondb
Uptime
- https://dashboard.uptimerobot.com/monitors/801378548

## cmds
- `npm run build && rm -rf ../backend/frontend/dist && cp -r dist ../backend/frontend/`
- `uvicorn app:app --reload --port 8000`
- to fix the python deps conflicts
```
cd ~/code/3000r/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

# Features

## 26/01/07
- [x] word quiz

## 11/10
- [x] review words
  - [x] counters
  - [x] bi-directional

## 11/02
- [x] back mechnican 
  - [x] customized timer
  - [x] presets
  - [ ] bg music

## 10/25
- [x] learning stats
  - [x] what to show: avg past week, past month, total hours
  - [x] where to show
- [x] word bank: show in order
- [ ] change the layout 
  - [ ] quick add section
  - [ ] quick add session provide date

## 10/11 
- [x] bash script to automate cmds
- [x] word review - alpha 
   - [x] review mode, e.g. random, past week, reverse chronological, etc
   - [x] more actions: hint, yes, no
   - [x] record word familarity, i.e. yes or no
   - [x] add one more review mode, basedc on familarity, probability distribution
   - [x] mobile friendly
- [ ] learning stats: to be discussed about the details

## 09/22
- [x] topic feature
- [ ] periodically backup db in case Neon is down or misconduct on the db
- [x] fix timezone issue
- [x] end timer after words review

## TODO 09/15 (DONE)
- [x] on the home page, i need to new faeture: 
so currently we can use start botton to start a session.
but sometimes i have done learning separately. i only want to record a session, by typing the duration. or i want to record some new words directly.
could you implement this as another option on 

- [x] for recent sessions (showing on both home page and start session page), can we show aggregated session info, e.g. instead of showing every session, can you show the learning duration for past a week aggregated per day

- [x] currently i'm using render to deploy this webpage. because i'm using a free plan, so the free instance will spin down with inactivity, which can delay requests by 50 seconds or more.

can i somehow activity this webpage by itself (e.g. on backend somehow) every few minutes, to prevent it inactivity?

## TODO 09/11
### word review
- [x] so in the first page, besides start session button, i want to add a new button leading to word bank page.

- [x] in word bank page, there are several ways to display/filter the words i have added

- [x] it can show the words added in past a day, a week, a month, or a customized range. it also has an option to show all the words.

- [x] for each word displayed, only show the word itself by default. when hover your mouse, it shows all the example sentences 
### word test
- [ ] select words: time based, random, familarity
- [ ] test. 
   - [ ] mode 1: show words, click yes or no
   - [ ] mode 2: show examples, click yes or no, hint shows words
- [ ] familarity is defined as
   - [ ] (#yes) / (#yes + #no)
   - [ ] every new word by default is #yes=0, #no=1
   - [ ] each click bump either #yes or #no

## TODO 9.8 (DONE)
couple feedbacks.

- [x] overall looks great. the word part works well
- [x] for the session, i don't need "back" button
- [x] in the first page, let's also show the latest 7 sessions as well
- [x] when i click end session button, please show a session summary on the right hand, which list all the new words added to the session (you can use the starttime to figure out all the new words)
- [x] after clicking the start session button, i want to a running clock of how long this session last so far
