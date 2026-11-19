---
"@open-twin/provider-oura": patch
---

Export `buildOuraBundle` from the package entry, so hosts that fetch Oura data themselves can build a bundle without importing from `src`.
