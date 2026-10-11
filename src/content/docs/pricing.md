---
title: Harga & Kuota
description: Cara kerja kuota token, batas RPM, dan siklus reset plan di bansosAI.
order: 4
---

## Kuota token

Plan dengan `tokenQuota` menghitung total token (input + output) selama periode aktif. Saat kuota
habis, request berikutnya ditolak dengan status `429` sampai periode berikutnya dimulai atau kamu
upgrade plan.

Plan dengan kuota `null` tidak dibatasi jumlah token, tetapi tetap dibatasi RPM dan concurrency.

## Batas RPM

`rpmLimit` adalah jumlah maksimum request per menit per API key. Batas ini melindungi hulu dari
lonjakan, bukan untuk membatasi pemakaian normal. Bila butuh throughput lebih besar, naikkan plan
atau tambah key dengan limit berbeda.

## Concurrency

`maxConcurrent` membatasi jumlah request yang boleh berjalan bersamaan pada satu key. Request yang
melebihi batas ini langsung ditolak `429`, jadi klien yang menjalankan banyak worker paralel harus
mengatur sendiri ukuran pool-nya.

## Siklus reset

Plan harian direset setiap hari pada tengah malam WIB (UTC+7). Plan mingguan dan bulanan mengikuti
tanggal aktivasi. Waktu reset ditampilkan di console sehingga kamu bisa merencanakan batch besar.

## Promo dan slot terbatas

Sebagian plan membatasi jumlah pembeli per periode (`slotLimit`). Halaman [harga](/pricing)
menampilkan sisa slot secara real-time; slot yang sudah terisi tidak bisa dibeli lagi sampai
periodenya berakhir.

## Tanpa biaya tersembunyi

Yang kamu lihat di halaman harga adalah yang kamu bayar. Tidak ada biaya per-model tambahan, tidak
ada markup kejutan, dan tidak ada minimum commitment.
