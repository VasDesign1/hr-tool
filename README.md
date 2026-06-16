# HR Tool

Internal HR portal for Vic Air contractors. Time tracking, leave, and payroll on a fully-free stack.

## Stack

- **Hosting** — GitHub Pages (this repo, served from `main`)
- **Auth** — Firebase Authentication (email/password)
- **Database** — Firestore
- **Project** — `hr-tool-vicair`

## Live URL

https://vasdesign1.github.io/hr-tool/

## Local layout

```
/                  index.html (auth router)
/login.html        sign-in page
/admin/            admin panel
/app/              contractor dashboard
/assets/           shared JS/CSS
/firestore.rules   security rules
```

## Deploy

`main` → GitHub Pages (automatic).

Firestore rules: `firebase deploy --only firestore:rules --project hr-tool-vicair`
