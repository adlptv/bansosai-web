---
title: Referensi API
description: Endpoint, autentikasi, format request, dan penanganan error API bansosAI yang kompatibel dengan OpenAI.
order: 2
---

## Base URL

```text
https://api.bansosai.app/v1
```

## Autentikasi

Setiap request menyertakan API key di header `Authorization`:

```http
Authorization: Bearer bns-xxxxxxxxxxxxxxxx
```

API key dibuat dan dicabut dari console. Satu akun bisa memegang beberapa key, masing-masing dengan
batas RPM dan kuota sendiri.

## Endpoint

| Metode | Path | Kegunaan |
|---|---|---|
| `POST` | `/v1/chat/completions` | Chat completion (streaming & non-streaming) |
| `POST` | `/v1/completions` | Text completion |
| `POST` | `/v1/embeddings` | Embedding teks |
| `GET` | `/v1/models` | Daftar model yang bisa diakses key-mu |

## Format request chat

```json
{
  "model": "claude-sonnet-4",
  "messages": [
    {"role": "system", "content": "Kamu asisten yang ringkas."},
    {"role": "user", "content": "Jelaskan routing otomatis."}
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false
}
```

## Respons

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "claude-sonnet-4",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "..."},
      "finish_reason": "stop"
    }
  ],
  "usage": {"prompt_tokens": 12, "completion_tokens": 48, "total_tokens": 60}
}
```

## Error

Semua error memakai status HTTP yang standar dengan badan JSON:

```json
{
  "error": {
    "code": "rate_limit",
    "message": "Terlalu banyak permintaan. Coba lagi sebentar."
  }
}
```

| Status | Arti |
|---|---|
| `400` | Request tidak valid — cek bentuk body dan nama model |
| `401` | API key tidak ada atau tidak valid |
| `403` | Key tidak berhak mengakses model tersebut |
| `404` | Model tidak ditemukan |
| `429` | Melebihi batas RPM atau kuota |
| `5xx` | Gangguan sementara di hulu — coba lagi |

## Idempotensi dan retry

Endpoint bersifat idempoten untuk request `GET`. Untuk `POST`, aman untuk mencoba ulang pada
`429` dan `5xx` dengan backoff eksponensial, karena token tidak dihitung dua kali saat request
gagal sebelum diproses hulu.
