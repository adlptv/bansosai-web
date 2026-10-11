---
title: FAQ
description: Jawaban atas pertanyaan umum tentang bansosAI — akun, API key, kuota, model, dan troubleshooting.
order: 5
---

## Apa itu bansosAI?

bansosAI adalah agregator API AI. Satu API key dan satu endpoint OpenAI-compatible memberi kamu
akses ke puluhan model dari berbagai vendor, dengan routing otomatis dan harga transparan.

## Apakah benar-benar gratis?

Ya. Plan Free aktif otomatis setelah daftar dan memberi kuota token bulanan tanpa kartu kredit.
Bila butuh kuota atau RPM lebih besar, ada plan berbayar harian, mingguan, dan bulanan.

## Apakah kode saya perlu diubah untuk pindah dari OpenAI?

Tidak banyak. Kalau kamu memakai SDK resmi, cukup ganti `base_url` ke
`https://api.bansosai.app/v1` dan pakai API key bansosAI. Struktur request dan responsnya sama.

## Kenapa request saya ditolak dengan 429?

Ada tiga kemungkinan: melebihi batas RPM, melebihi kuota token, atau melebihi batas concurrency.
Console menampilkan pemakaian terkini supaya kamu tahu batas mana yang tersentuh.

## Bagaimana kalau sebuah provider sedang down?

Routing otomatis memindahkan request ke provider sehat berikutnya untuk model yang sama. Kamu
tidak perlu mengubah apa pun di sisi klien.

## Di mana saya melihat model yang tersedia?

Buka [katalog model](/models) untuk melihat daftar lengkap beserta konteks, batas output, dan tier.
[Peringkat model](/model-ranking) menampilkan model mana yang paling banyak dan paling andal
melayani trafik nyata.

## Bagaimana cara mencabut API key?

Dari console: pilih key yang ingin dicabut, lalu revoke. Key yang dicabut berhenti bekerja seketika
dan tidak bisa dikembalikan; buat key baru bila perlu.
