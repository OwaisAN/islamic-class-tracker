# Saturday Class Tracker

Next.js (App Router) + Firestore. No login in v1.

## Setup
1. Create a Firebase project, add a **Web app**, and enable **Firestore** (production mode).
2. `cp .env.local.example .env.local` and fill in the six values from the Firebase web config.
3. Paste `firestore.rules` into Firestore → Rules and publish. (v1 rules are open, see the note in that file.)
4. `npm install && npm run dev`, then open http://localhost:3000.
5. `npm test` runs the unit tests for the stuck-detection, dua auto-advance and parent-text logic.

## Deploy
1. Push to GitHub, import the repo in Vercel.
2. Add the same six `NEXT_PUBLIC_FIREBASE_*` variables in Vercel → Settings → Environment Variables.
3. Vercel → Domains: add your domain and set the DNS records it shows.

## Layout
- `lib/logic.ts`: all business rules (pure, tested)
- `lib/data.ts`: the only file that talks to Firestore (add `teacherId` filtering / Firebase Auth here later)
- `lib/quran.ts`: surah data, letters, issue tags, Qaida page/line limits (`QAIDA_PAGES`, `QAIDA_LINES`)
- `app/`: home, `student/[id]`, `settings`
