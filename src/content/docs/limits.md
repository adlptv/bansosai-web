---
title: Batas & Kuota
description: Batas RPM, kuota token, dan concurrency di bansosAI, serta apa yang terjadi saat batas tercapai.
order: 7
---

## Jenis batas

bansosAI menerapkan tiga jenis batas pada tiap API key:

- **RPM** — jumlah request per menit.
- **Kuota token** — total token (input + output) per periode plan.
- **Concurrency** — jumlah request yang boleh berjalan bersamaan.

## Saat batas tercapai

Batas yang terlampaui menghasilkan HTTP `429` dengan badan error:

```json
{ "error": { "code": "rate_limit", "message": "Terlalu banyak permintaan. Coba lagi sebentar." } }
```

Untuk concurrency, pesan menyebut batas konkuren yang dilewati. Untuk kuota,
pesan menyebut kuota habis sampai periode berikutnya.

## Melihat pemakaian

Dashboard menampilkan pemakaian terkini:

- `/app` — ringkasan plan, kuota, dan grafik 14 hari.
- `/app/usage` — rincian request terbaru.
- `/app/keys` — daftar key beserta batas dan total token.

## Menambah kapasitas

Bila sering menyentuh batas, naikkan plan di `/app/billing` atau tambah key
dengan batas berbeda. Plan dengan `tokenQuota` null tidak dibatasi jumlah token,
tetapi tetap dibatasi RPM dan concurrency.
