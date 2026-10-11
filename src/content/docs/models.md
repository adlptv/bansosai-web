---
title: Panduan Model
description: Cara memilih model di bansosAI — memahami konteks, batas output, kemampuan reasoning, dan arti tier free/premium.
order: 3
---

## Membaca spesifikasi model

Setiap model di [katalog](/models) mencantumkan empat angka yang paling menentukan biaya dan
kecocokan:

- **Konteks** — jumlah token yang bisa diproses dalam satu percakapan (input + output).
- **Max output** — batas token yang bisa dihasilkan dalam satu respons.
- **Modalitas** — jenis input yang diterima (teks, gambar, audio).
- **Reasoning** — apakah model mendukung penalaran bertahap sebelum menjawab.

## Memilih berdasarkan kebutuhan

| Kebutuhan | Pilihan yang masuk akal |
|---|---|
| Percakapan umum, cepat, murah | Model flash dengan konteks besar |
| Analisis dokumen panjang | Model dengan konteks ≥ 200K |
| Tugas penalaran kompleks | Model dengan flag reasoning |
| Latensi rendah untuk chat | Model tanpa mode thinking |

## Tier free dan premium

Model berlabel `Free` bisa dipakai pada plan gratis. Model premium menuntut plan berbayar. Tier
ditentukan oleh operator dan bisa berubah; label yang tampil di katalog selalu yang berlaku saat
kamu membaca halaman itu.

## Konteks besar bukan berarti selalu lebih baik

Model dengan konteks 1M token berguna untuk dokumen besar, tetapi setiap token yang dikirim tetap
dihitung. Untuk tugas pendek, model konteks kecil sering lebih cepat dan sama akuratnya.

## Mengganti model saat runtime

Model adalah string biasa di body request. Tidak ada konfigurasi per-model yang perlu diubah di
sisi klien, jadi kamu bisa A/B-test antar model hanya dengan mengubah satu nilai:

```json
{ "model": "deepseek-v4.1-flash", "messages": [] }
```

## Melihat trafik nyata

[Peringkat model](/model-ranking) menampilkan permintaan, token, dan tingkat keberhasilan per
model, dihitung dari trafik gateway yang sebenarnya — berguna untuk menilai model mana yang paling
stabil untuk beban kerjamu.
