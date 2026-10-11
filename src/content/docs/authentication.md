---
title: Autentikasi
description: Cara autentikasi ke API bansosAI — API key, header Bearer, dan pengelolaan sesi.
order: 6
---

## API key

Semua panggilan API memakai API key di header `Authorization`:

```http
Authorization: Bearer bns-xxxxxxxxxxxxxxxx
```

API key dibuat dari dashboard (`/app/keys`) dan bisa dicabut kapan saja. Satu akun
boleh memegang beberapa key dengan batas yang berbeda.

## Menyimpan key dengan aman

Simpan key di variabel lingkungan, jangan di kode yang masuk repositori:

```bash
export BANSOS_API_KEY="bns-xxxxxxxxxxxxxxxx"
```

Key hanya ditampilkan sekali saat dibuat. Bila hilang, buat key baru dan cabut
yang lama.

## Sesi dashboard

Login dashboard memakai cookie sesi `bns_session` (httpOnly, SameSite=Lax,
berlaku 30 hari). Cookie ini tidak pernah dibaca oleh JavaScript halaman,
sehingga tidak bisa dicuri lewat XSS.

## OAuth

Akun bisa masuk lewat Google. OAuth dijalankan sebagai alur sign-in: server
menukar kode otorisasi satu kali pakai, lalu memasang cookie sesi. Bila akun
belum punya password, kamu bisa membuatnya di `/app/set-password` agar bisa
login dengan email/password.

## Mencabut sesi

Dari dashboard (`/app/settings`) kamu bisa melihat sesi aktif dan mencabut
perangkat lain. Mengganti password otomatis mencabut semua sesi lain.
