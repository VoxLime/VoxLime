# VoxLime — ধাপ ১ (বাংলা নির্দেশনা)

## কী আছে
- React + Vite homepage
- AniList GraphQL থেকে Trending, Popular ও Latest anime
- Search এবং Genre filter
- Anime details modal
- বাংলা/English toggle
- Mobile responsive layout

## মোবাইল থেকে Cloudflare Pages-এ প্রকাশ
এই প্রজেক্টটি GitHub-এ আপলোড করে Cloudflare Pages-এর সঙ্গে যুক্ত করা সবচেয়ে সহজ।

### ১) GitHub repository
1. github.com খুলে অ্যাকাউন্টে লগইন করুন।
2. New repository চাপুন।
3. নাম দিন `voxlime`।
4. Public বা Private যেকোনোটি বেছে Create repository করুন।
5. ZIP ফাইলটি Extract করে ফোল্ডার ও ফাইলগুলো repository-তে আপলোড করুন। `package.json`, `index.html`, `src`, `public` যেন repository root-এ থাকে।

### ২) Cloudflare Pages
1. dash.cloudflare.com-এ লগইন করুন।
2. Workers & Pages → Create application → Pages → Connect to Git বেছে নিন।
3. GitHub repository `voxlime` নির্বাচন করুন।
4. Framework preset: `Vite`
5. Build command: `npm run build`
6. Build output directory: `dist`
7. Save and Deploy চাপুন।

### ৩) Website link
Deploy সফল হলে Cloudflare একটি `*.pages.dev` ঠিকানা দেবে। সেটি খুলে ওয়েবসাইট দেখুন।

## লোকালি চালানোর কমান্ড
Node.js ইনস্টল করা কম্পিউটারে:
```bash
npm install
npm run dev
```
Production build:
```bash
npm run build
```

## গুরুত্বপূর্ণ
- এই প্রথম ধাপে ভিডিও/এপিসোড স্ট্রিমিং নেই; এটি Anime discovery ও information homepage।
- AniList-এর API থেকে তথ্য আসে; API সাময়িকভাবে বন্ধ থাকলে error দেখাবে।
- AniList-এর তথ্য/ছবি তাদের নিজস্ব সেবা ও নীতিমালার অধীন।
- API key বা secret এই frontend-এ রাখা হয়নি।
- `Watchlist` এবং `Profile` এখন placeholder; পরবর্তী ধাপে backend/database যুক্ত করে বাস্তব করা হবে।

- VoxLime deployment update.
