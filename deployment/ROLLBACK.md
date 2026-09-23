# Freeze artifacts and rollback package

**Status: IN PROGRESS — no production write is authorized by this document.**

This file records the pre-change baseline and the exact rollback material for the
`bansos-web` rebuild and the Cartethyia announcement/slide work. It exists so a
failed change can be reverted without improvising. Values are redacted; secrets
are never recorded.

## 1. Hosts and roles

| Host | Role in this project | Notes |
|---|---|---|
| VPS-A | Authoritative API + PostgreSQL; serves `api.bansosai.app` | Cartethyia gateway on `:12801` |
| VPS-B | Web tier; serves `bansosai.app` | Astro SSR on `:4321`, plus a non-authoritative local gateway and database |

Host identity must be confirmed by IP, not hostname: both hosts report the same
hostname, which has caused past misidentification.

## 2. Pre-change baseline — captured 2026-09-22 (read-only)

### 2.0 Verified backups taken 2026-09-22

Taken additively (new files only; no schema, data, service, or routing change).

```text
VPS-A dump   /var/backups/rebuild-prebuild/cartethyia-20260922T171423Z.dump
             28,143,798 bytes   sha256 2b226da38575cb5b   mode 0600 postgres:postgres
             directory mode 0700
VPS-B dump   /var/backups/rebuild-prebuild/cartethyia-b-20260922T171523Z.dump
             17,555,655 bytes   sha256 44bc9364162ed3f5   mode 0600
VPS-B posters /var/backups/rebuild-prebuild/posters-b/  1 file, mode 0700
             source hash d6b5f03a8104 == backup hash d6b5f03a8104
VPS-B dist   /var/backups/rebuild-prebuild/dist-b-20260922T171538Z/  155 files, 3.5M
             per-file manifest identical to live dist (see 2.0.2)
```

Initial permission mistake and its fix: the first dump inherited `0644`, i.e.
potentially world-readable. Both the file (`0600`) and the directory (`0700`)
were then restricted, because a database dump is a full credential store in
cleartext.

### 2.0.1 Restore rehearsals — PASSED

Each dump was restored into a scratch database on its own host, verified, and the
scratch database was then dropped. No production database was modified.

```text
VPS-A  scratch rehearsal_restore_a
       pg_restore exit 0, 0 error lines
       tables=44  saas_users=244  announcements=2
       both announcement rows restored with active=false; poster columns present (2)
       dropped after verification

VPS-B  scratch rehearsal_restore_b
       pg_restore exit 0, 0 error lines
       tables=44  saas_users=71  announcements=1
       the single announcement restored with active=true and poster present
       dropped after verification
```

No row identifiers are recorded here; the counts and state flags above are
sufficient to prove the restore carried the expected data, and identifiers are
not needed to reproduce the rehearsal.

Counts in the restored copies match the live counts read earlier, and the live B
announcement survives a restore intact with its poster flag. That is what makes
these backups a *rollback capability* rather than an inventory.

### 2.0.1a Scratch cleanup verification

```text
VPS-A  rehearsal_restore_a  -> dropped, confirmed absent from the database list
VPS-B  rehearsal_restore_b  -> dropped, confirmed absent from the database list

Unrelated pre-existing databases observed during the check:
  on VPS-A: audit_dump_probe, merge_probe   (NOT created by this work, left alone)
  on VPS-B: none beyond the application database
```

`audit_dump_probe` and `merge_probe` were observed on **VPS-A**, not VPS-B. They
predate this work and their ownership/creation time was not investigated, so they
are recorded as observed-and-left-alone rather than cleaned up. Dropping a
database that another task may still need would be a destructive act outside this
plan's scope.

### 2.0.2 dist snapshot verification — PASSED

A per-file manifest was compared with identical relative-root semantics:

```text
snapshot files 155   live files 155
sha256sum manifest, sorted by path: MANIFEST_IDENTICAL
```

An earlier aggregate-hash mismatch was a path-prefix artifact (`dist/client/...`
versus `client/...`), not a content difference. Aggregate hashes alone are not
sufficient evidence of a usable snapshot; the per-file manifest is.

### 2.0.3 Still outstanding

```text
[ ] retention policy for these backups is not defined
[ ] the scratch restore proves data is restorable, NOT that restoring over the
    live database is safe mid-operation; cutover-time restore procedure is still
    unwritten
[ ] no restore has been rehearsed on a host other than the one that produced the
    dump
```

## 2.1 Pre-change inventory (unchanged)

**Snapshot method:** read-only shell inspection over SSH on 2026-09-22. The dist
aggregate is `sha256` over the sorted output of `sha256sum` for every file under
the dist tree (i.e. a hash of a hash manifest, not of a tarball). The binary hash
is a direct `sha256sum` of the file. Counts are `find … -type f | wc -l`. No
timestamp or algorithm is claimed beyond what each command produced; a re-run
that disagrees with these values means the tree changed and the snapshot is stale.

```text
VPS-B web dist tree     155 files, aggregate sha256 prefix 923218b2ee27055124dd896b7c1dc733
VPS-B dist backups      22 directories; newest named dist.bak-20260921-224250 (3.1M)
                        plus dist.rollback-20260921-224846 and 9 pre-change tarballs
VPS-A gateway binary    22,298,786 bytes, sha256 prefix 6674d1ca825e6aa0
VPS-B gateway binary    identical size and hash (same build)
VPS-A posters           1 file on disk
VPS-B posters           1 file on disk
VPS-A latest DB dump    /var/backups/cartethyia-api/cartethyia-api-20260922T132207Z.dump
                        (previous: ...20260922T012322Z.dump)
```

These are **snapshots**, not guarantees. Nothing here proves a value is still
current, and nothing here was produced by this project — the dist backups and the
scheduled dumps are pre-existing operational material.

Rollback material that already exists: the dist backup directories on VPS-B and
the scheduled PostgreSQL dumps on VPS-A. That is a favorable starting position,
but it has not been verified as restorable.

## 2.1 Verification status of that baseline

```text
[ ] dist backup restore has NOT been rehearsed into a scratch directory
[ ] pg dump restore has NOT been rehearsed into a scratch database
[ ] no checksum was computed at backup time to prove a backup matches its source
[ ] no retention policy was confirmed for either set
[ ] the pg dump has not been listed with pg_restore -l to confirm it is readable
```

Until those boxes are checked, the baseline is *inventory*, not a proven
rollback capability. No command in section 3 may be treated as tested.

## 2.2 Still to capture (TODO)

```text
[ ] redacted copy of the web service unit (names only, no values)
[ ] redacted copy of the gateway service unit and dotenv KEY NAMES only
[ ] per-file checksum manifest of the current dist tree, kept as a file rather
    than a single aggregate hash, so a partial restore can be validated
[ ] public route probe results before any change
```

Backups and poster binaries stay on the hosts: nothing is copied into the
workspace, and no production file is modified by this package.

## 3. Rollback commands (UNVERIFIED — to be finalized after the rehearsals)

```text
[ ] Web tier: restore the previous release artifact and restart the web service
[ ] Web tier: restore the previous dist tree from the recorded backup directory
[ ] Gateway: restore the previous binary and restart, only after confirming
    schema compatibility with whatever migration ran
[ ] Database: restore from the verified dump into a scratch database first,
    inspect, then decide — never restore over the live database blind
[ ] Routing: restore captured ingress/Caddy values, then re-probe across at
    least one failover period and one healer period
```

Routing rollback must account for the failover automation measured in the plan:
a job runs roughly every 30 seconds and rewrites the `api.bansosai.app` DNS
record, so DNS-level changes are not durable and are not part of this plan.

## 4. Retention

```text
[ ] Retention window for the web release artifacts
[ ] Retention window for database dumps
[ ] Retention window for poster binaries after a storage migration
[ ] Who authorizes deletion, and how it is recorded
```

## 5. Prohibited during freeze and rollback

1. No `git` operations in the parent Cartethyia repository as part of this work.
2. No edits to compiled `dist` or `.astro.mjs` as a source of truth.
3. No printing of service environment values, connection strings, or tokens.
4. No restoring a database dump over the live database without an inspected
   scratch restore.
5. No assumption that B-local data is disposable: its live announcement row is
   currently the only publicly visible one.

## 6. Blocking conditions

This package cannot be considered complete while:

- the credential-exposure incident gates remain open (rotation, journal handling,
  deployment of the logging fix);
- announcement write ownership is unresolved (recorded as unknowable from
  available telemetry);
- catalog/tier parity is unproven, so a routing change would alter the public
  model catalog.
