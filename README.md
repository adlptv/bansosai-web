# bansos-web rebuild workspace

Controlled reimplementation of the `bansosai.app` web tier.

## What this directory is

The production host runs a built Astro application but no longer holds its
source: only `package.json`, `package-lock.json`, `node_modules`, and `dist`
exist under the deployment path. Editing compiled output is not maintainable, so
this workspace rebuilds an editable project that preserves the existing contract.

This is a **reimplementation**, not recovered source. Any behaviour that cannot
be proven from the running application, its API contract, or operator statement
is not invented here.

## Rules that govern this workspace

1. Never copy compiled `dist` or `.astro.mjs` as source.
2. Preserve browser-visible routes and response contracts; changes must be
   additive and proven by parity checks.
3. No database credentials in this project. All SaaS reads/writes go through the
   server-side API client to the authoritative API.
4. Preserve the existing visual design. Layout, typography, spacing, and the
   poster/modal behaviour must remain equivalent; see the UI-preservation
   acceptance gate in `docs/PLAN_BANSOS_WEB_REBUILD_CARTETHYIA_A.md`.
5. Secrets come from the service environment; never commit or log them.

## Current status

Scaffold plus a **verified build pipeline**. Feature code (pages, components, API
client implementation, announcement domain) is **not** written, because
implementation is gated on evidence that is still open: announcement write
ownership, catalog/tier parity, and the credential incident remediation recorded
in the plan.

Verified so far, inside this isolated repository:

```text
npm install           470 packages installed, package-lock.json generated
npm run verify        astro check (0 errors/warnings/hints) + astro build, both pass
src/pages/index.astro minimal shell, proves the pipeline only
src/lib/api/client.ts interface only; createApiClient() throws by design
```

Deliberately absent:

```text
no recovered source        the original source was never found; this is a
                           controlled reimplementation
no production claims       the build output is not a drop-in replacement yet
no database credentials    this tier must never hold them
no parent-repo coupling    this directory has its own git history and ignore file
```

Do not deploy anything from this directory until the plan's cutover gate passes.

## Pinned versions

```text
astro            ^5.0.0        mirrors the measured deployed runtime
@astrojs/node    ^9.5.5        SSR adapter, standalone mode
@astrojs/check   ^0.9.10       dev-only type checking
typescript       ^5.9.3        dev-only
```

The lockfile pins the resolved versions; it is committed with the project so a
rebuild is reproducible. Upgrading a pin is a deliberate change with its own
verification, not a side effect of an install.

### Dependency audit — open finding, 2026-09-22 (deployment blocked)

`npm audit --omit=dev` reports 4 advisories. Runtime-vs-build classification is
part of the finding, not an excuse: `astro` and `@astrojs/node` are **runtime**
dependencies of an SSR server, so their advisories are reachable at request time
in principle. `sharp` reachability was **not** verified and must not be assumed
build-only: Astro uses it in the image pipeline and the generated server code
decides whether that path is live.

Per-advisory record required before any deployment. Resolved versions were read
from `package-lock.json` on 2026-09-22 (not assumed):

```text
astro          5.18.2
@astrojs/node  9.5.5
sharp          0.34.5
esbuild        0.27.7
```

| Advisory | Package | Reported severity | Resolved version | Reachability status | Required decision |
|---|---|---|---|---|---|
| `GHSA-r557-wffq-wvrc` | `@astrojs/node` | moderate | 9.5.5 | **not assessed** | upgrade / mitigate / accept with rationale |
| astro advisory reported for the `<=7.2.7` range | `astro` | critical | 5.18.2 | **not assessed**; the audit range and the installed major disagree, which itself needs explanation before any conclusion | upgrade / mitigate / accept with rationale |
| `GHSA-g7r4-m6w7-qqqr` | `esbuild` | low | 0.27.7 | **not assessed** — do NOT call it dev-only. `npm audit --omit=dev` still reports it, so its dependency path must be traced and its presence in the generated SSR artifact checked | upgrade / mitigate / accept with rationale |
| `GHSA-f88m-g3jw-g9cj`, `GHSA-g89c-p67h-r497`, `GHSA-2jg2-4ch7-h545`, CVE-2026-33327/33328/35590/35591 | `sharp` | high | 0.34.5 | **not assessed** (image pipeline usage unknown) | upgrade / mitigate / accept with rationale |

Explicit non-decisions:

- `npm audit fix --force` was NOT run. It would move the framework off the pinned
  major versions, destroying the parity target that mirrors the deployed runtime.
- The audit's own reported range for the astro advisory cannot be satisfied by any
  `^5` release, so resolving it is a framework-upgrade project with its own plan.
- `npm run verify` proves **compilation and types only**. It is not a security
  check and says nothing about the advisories above.

Deployment remains blocked until each row has a recorded decision, the resolved
versions are read from the lockfile rather than assumed, and `sharp`/`esbuild`
reachability is determined from the generated server output.

## Layout

```text
src/pages/                 route entry points (parity with the deployed app)
src/components/            shared UI
src/layouts/               page shells
src/lib/api/               server-side API client (single boundary)
src/lib/auth/              session handling for the web tier
src/domain/announcements/  announcement/slide domain types and validation
tests/                     parity and behaviour tests
deployment/                service config and release notes (no secrets)
```

## Status implementasi Cartethyia terkait fitur slide

```text
SUDAH (lokal, teruji, belum di-deploy):
  internal/db/announcement_slide_ddl.go             DDL kanonik jalur migrasi
  internal/db/schema.sql                            salinan statis untuk instalasi baru
  internal/db/announcement_slide_ddl_test.go        4 test penjaga drift
  internal/db/announcement_slides_migration_test.go 6 test SQLite
  internal/db/announcement_slides_pg_test.go        4 test PostgreSQL (fresh/upgrade/cascade/shape)
  internal/store/announcement_slide.go              domain + validasi + urutan + legacy bridge
  internal/store/announcement_slide_test.go         12 test
  internal/store/announcement_slide_repo.go         persistence: create/update/delete/list/reorder
  internal/store/announcement_slide_repo_test.go    14 test
  internal/store/announcement_slide_counter_test.go 5 test SQLite + 2 test PostgreSQL
  announcement_slide_counts                         tabel counter penegak batas (lihat di bawah)

CARA BATAS JUMLAH SLIDE DITEGAKKAN (dan kenapa bukan dengan cara yang mudah):

```text
Percobaan pertama: BEGIN; SELECT count(*); INSERT; COMMIT.
  -> TIDAK menutup balapan. Pada PostgreSQL isolasi default READ COMMITTED,
     beberapa transaksi boleh sama-sama membaca count=19 lalu keduanya
     menyisipkan baris ke-20 dan ke-21. Recount di dalam transaksi tidak
     menolong: baris yang belum commit tidak terlihat.
Percobaan kedua: SELECT 1 FROM announcements WHERE id=? FOR UPDATE.
  -> Menutup balapan di PostgreSQL, tetapi SQLite menolak sintaks itu, jadi
     tidak bisa dipakai di satu jalur kode. Perlu cabang per-engine, dan cabang
     itu harus tahu engine dari suatu tempat — *sql.DB tidak menyimpan DSN.
Cara yang dipakai: counter per pengumuman + UPDATE bersyarat.
  - announcement_slide_counts(announcement_id PK, cap, slide_count, updated_at)
  - Create: INSERT ... SELECT (angka awal = COUNT(*) data nyata, kegagalan
    primary key diterima sebagai "sudah ada") lalu
    UPDATE ... SET slide_count = slide_count + 1
      WHERE announcement_id = ? AND slide_count < cap
    Satu statement UPDATE memegang kunci baris sampai commit, dan RowsAffected
    adalah jawabannya: 1 = dapat slot, 0 = penuh. Berlaku sama di kedua engine.
  - Delete: DELETE slide + pengembalian slot dalam SATU transaksi, supaya
    counter tidak pernah lebih besar dari jumlah baris nyata.
  - Boot: reconcileSlideCounters menyamakan counter dengan COUNT(*) nyata,
    menutup instalasi lama dan penyimpangan apa pun.
```

Batasan yang saya terima dengan sadar:

```text
- isDuplicateKey menyesuaikan pada TEKS error (unique constraint / duplicate key
  / SQLSTATE 23505), bukan kode bertipe, karena driver di internal/db membungkus
  driver PG dan tipe error aslinya tidak sampai ke lapisan ini. Kalau teks
  berubah, gejalanya error saat dua penulis bersamaan — bukan data salah; test
  konkurensi menutupnya.
- cap disimpan per baris supaya perubahan SlideMaxPerAnnouncement di kode tidak
  diam-diam mengubah arti data lama. Kesamaan nilai awal cap dengan konstanta
  store diuji oleh TestSlideCapAgreesWithStoreLimit.
- Belum ada route HTTP; semua ini masih lokal dan belum di-deploy.
```

BUKTI: go build ./... OK; go test ./internal/store ./internal/db OK; gofmt/vet
bersih. Lawan PostgreSQL nyata: TestPGSlideCounterReservesAtomically (12 penulis
memperebutkan slot terakhir, tepat satu berhasil) dan
TestPGReconcileCountersRepairsDrift (baris hilang + angka menyimpang diperbaiki,
`cap` tidak ditimpa). Catatan operasional: database scratch di VPS38 dijangkau
lewat forward SSH lokal; sambungan itu menambah ~0,3-1,5 detik per round trip,
jadi suite PG berbobot operasi store berjalan lambat meski query-nya benar.

BUKTI:
  go build ./...                 OK
  go test ./internal/db         ok  (SQLite; PostgreSQL lewat scratch di VPS38)
  go test ./internal/store      ok
  PostgreSQL operasi slide: batas jumlah (12 penulis, tepat satu dapat slot
  terakhir) dan reconcile counter (baris hilang + angka menyimpang) lulus
  terhadap PostgreSQL nyata — lihat announcement_slide_counter_test.go

CATATAN DDL — jangan salah baca:
  schema.sql TETAP memuat salinan statis tabel ini. Jadi ini bukan "satu sumber
  yang dipakai dua jalur", melainkan DDL migrasi kanonik + penjaga drift
  (TestSchemaSQLContainsExactSlideDDL). Kesamaan keduanya diverifikasi oleh test,
  bukan dijamin oleh struktur.

BELUM:
  route + handler HTTP untuk operasi slide
  service identity B -> A
  halaman admin /admin/announcements
  slideshow publik di /app
  deploy migrasi ke produksi

Catatan scope: file internal/store/announcement_repo.go sedang membawa perubahan
lama (kolom poster_image/poster_link, normalisasi poster) yang bukan milik
pekerjaan slide. Perubahan slide ditulis di file terpisah supaya tidak bercampur
dengan diff yang belum selesai itu.
