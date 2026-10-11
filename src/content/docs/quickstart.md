---
title: Quickstart
description: Kirim request pertama kamu ke bansosAI dalam lima menit — daftar, buat API key, lalu panggil endpoint OpenAI-compatible.
order: 1
---

## 1. Daftar dan buat API key

Buka [halaman daftar](/register), buat akun, lalu ambil API key pertamamu dari console. Plan Free
aktif otomatis, jadi kamu bisa langsung mengirim request tanpa menambahkan metode pembayaran.

Simpan key itu di variabel lingkungan, jangan pernah menaruhnya langsung di kode:

```bash
export BANSOS_API_KEY="bns-xxxxxxxxxxxxxxxx"
```

## 2. Kirim request pertama

Endpoint-nya kompatibel dengan OpenAI, jadi SDK yang sudah kamu pakai langsung jalan. Cukup ganti
base URL:

```bash
curl https://api.bansosai.app/v1/chat/completions \
  -H "Authorization: Bearer $BANSOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [{"role": "user", "content": "Halo!"}]
  }'
```

## 3. Pakai dari SDK Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.bansosai.app/v1",
    api_key="bns-xxxxxxxxxxxxxxxx",
)

resp = client.chat.completions.create(
    model="claude-sonnet-4",
    messages=[{"role": "user", "content": "Halo!"}],
)
print(resp.choices[0].message.content)
```

## 4. Streaming

Tambahkan `"stream": true` untuk menerima token satu per satu. SDK OpenAI menanganinya lewat
iterator yang sama seperti biasa:

```python
stream = client.chat.completions.create(
    model="claude-sonnet-4",
    messages=[{"role": "user", "content": "Ceritakan singkat tentang dirimu."}],
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="")
```

## 5. Ganti model tanpa ganti kode

Satu API key berlaku untuk semua model. Untuk berpindah model, cukup ubah nilai `model`. Lihat
[daftar lengkapnya](/models) beserta konteks dan batas output masing-masing.
