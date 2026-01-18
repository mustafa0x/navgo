# Changelog

## v6

- breaking: loader errors now abort navigation (no URL/history change)
  - migration: catch in `loader` and return your own `{ __error }` (or fallback data) if you want the previous behavior
- use `param_rules` for per-param validation + coercion (superseding `param_validators`, which has been removed)
  - example:
    - before: `param_validators: { id: Navgo.validators.int({ min: 1 }) }`
    - after: `param_rules: { id: { validator: Navgo.validators.int({ min: 1 }), coercer: Number } }`
- remove `url_changed` option (deprecated migration hook)
  - migrate to `router.route.subscribe(...)` or `after_navigate(...)` for URL change notifications
