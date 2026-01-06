# Changelog

## v6

- add route groups for nested layouts/shared loaders; expose ordered `matches` (layouts → route) on `nav.to.matches` and `router.route`
- run group loaders (and group `before_route_leave`) for matched child routes; preload caches the full loader chain and `goto` reuses it
- use `param_rules` for per-param validation + coercion (superseding `param_validators`, which has been removed)
  - example:
    - before: `param_validators: { id: Navgo.validators.int({ min: 1 }) }`
    - after: `param_rules: { id: { validator: Navgo.validators.int({ min: 1 }), coercer: Number } }`
- remove `url_changed` option (deprecated migration hook)
  - migrate to `router.route.subscribe(...)` or `after_navigate(...)` for URL change notifications
