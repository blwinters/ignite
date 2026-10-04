import { GluegunToolbox } from "gluegun"

export type OptionalModuleName = "supabase" | "tanstack-query"

export type ModuleDescriptor = {
  name: OptionalModuleName
  dependencies: Record<string, string>
  files: Array<{ from: string; to: string }>
  publicEnv: string[]
  entryProvider?: { name: string; file: string }
}

export const availableOptionalModules: OptionalModuleName[] = ["supabase", "tanstack-query"]

function readModule(context: GluegunToolbox, name: OptionalModuleName) {
  const modulePath = context.filesystem.path(`${context.meta.src}`, "../boilerplate/modules", name)
  const descriptor = context.filesystem.read(
    context.filesystem.path(modulePath, "module.json"),
    "json",
  ) as ModuleDescriptor
  return { modulePath, descriptor }
}

export function parseOptionalModules(raw?: string): OptionalModuleName[] {
  const selected: OptionalModuleName[] = []
  for (const name of (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)) {
    if (!availableOptionalModules.includes(name as OptionalModuleName)) {
      throw new Error(
        `Unknown or unavailable optional module "${name}". Available modules: ${availableOptionalModules.join(", ")}. Planned modules are not installable; see docs/optional-modules.md.`,
      )
    }
    if (!selected.includes(name as OptionalModuleName)) selected.push(name as OptionalModuleName)
  }
  return selected
}

/** Stage dependencies before installation; apply module files after navigation conversion. */
export function addOptionalModuleDependencies(
  context: GluegunToolbox,
  targetPath: string,
  modules: OptionalModuleName[],
): void {
  const selected = parseOptionalModules(modules.join(","))
  if (selected.length === 0) return
  const packagePath = context.filesystem.path(targetPath, "package.json")
  const packageJson = context.filesystem.read(packagePath, "json")
  // A dependency cache must not depend on the order modules were selected.
  for (const name of [...selected].sort()) {
    const { descriptor } = readModule(context, name)
    packageJson.dependencies = { ...packageJson.dependencies, ...descriptor.dependencies }
  }
  context.filesystem.write(packagePath, packageJson)
}

function wireEntryProvider(
  context: GluegunToolbox,
  targetPath: string,
  provider: NonNullable<ModuleDescriptor["entryProvider"]>,
) {
  const { filesystem } = context
  const routerEntry = filesystem.path(targetPath, "src/app/_layout.tsx")
  const entry = filesystem.exists(routerEntry)
    ? routerEntry
    : filesystem.path(targetPath, "app/app.tsx")
  let source = filesystem.read(entry)
  if (!source) throw new Error(`Cannot wire ${provider.name}: app entry was not found`)
  if (source.includes(`<${provider.name}>`)) return
  if (!source.includes("<SafeAreaProvider") || !source.includes("</SafeAreaProvider>")) {
    throw new Error(`Cannot wire ${provider.name}: app entry has no root SafeAreaProvider`)
  }
  const prefix = entry === routerEntry ? "../../" : "../"
  source = source.replace(
    /^import /m,
    `import { ${provider.name} } from "${prefix}${provider.file}"\n\nimport `,
  )
  source = source.replace("<SafeAreaProvider", `<${provider.name}>\n    <SafeAreaProvider`)
  source = source.replace("</SafeAreaProvider>", `</SafeAreaProvider>\n    </${provider.name}>`)
  filesystem.write(entry, source)
}

export async function applyOptionalModules(
  context: GluegunToolbox,
  targetPath: string,
  modules: OptionalModuleName[],
): Promise<void> {
  const { filesystem } = context
  const { path, read, write, copyAsync } = filesystem
  const selected = parseOptionalModules(modules.join(","))
  if (selected.length === 0) return

  addOptionalModuleDependencies(context, targetPath, selected)
  for (const name of selected) {
    const { modulePath, descriptor } = readModule(context, name)
    for (const file of descriptor.files) {
      await copyAsync(path(modulePath, "files", file.from), path(targetPath, file.to))
    }
    if (descriptor.entryProvider) wireEntryProvider(context, targetPath, descriptor.entryProvider)
  }
  const ignorePath = path(targetPath, ".gitignore")
  write(
    ignorePath,
    `${read(ignorePath) ?? ""}\n# Local environment configuration\n.env\n.env.*\n!.env.example\n`,
  )
}
