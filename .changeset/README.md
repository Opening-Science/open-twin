# Independent package releases

Run `pnpm changeset` when changing a public package. Select only affected packages
and describe the consumer-visible change. Package versions are independent.
Before 1.0, use a minor bump for breaking changes and a patch for compatible fixes.

Use `pnpm release:status` to preview and `pnpm release:version` to apply versions.
The version wrapper promotes affected pre-1.0 dependents to minor releases when
a breaking shared dependency leaves their compatibility range.

Biome formatting is disabled for `.changeset/*.md` because its Markdown formatter
can rewrite YAML release metadata as a heading. Keep package entries between the
opening and closing `---`, and check them with `pnpm release:status`.

Do not run `changeset publish`: releases use approved, signed package tags and
the selective publishing workflow. See [publishing](../docs/PUBLISHING.md).
