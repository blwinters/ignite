export type AppVariant = "development" | "preview" | "production"

export function getAppVariant(value = process.env.APP_VARIANT): AppVariant {
  if (value === "development" || value === "preview") return value
  return "production"
}

export function getVariantConfig(
  baseName: string | undefined,
  iosIdentifier: string | undefined,
  androidIdentifier: string | undefined,
  variant = getAppVariant(),
) {
  const suffix = variant === "development" ? ".dev" : variant === "preview" ? ".preview" : ""
  const label = variant === "development" ? " (Dev)" : variant === "preview" ? " (Preview)" : ""

  return {
    name: baseName ? `${baseName}${label}` : baseName,
    ios: { bundleIdentifier: iosIdentifier ? `${iosIdentifier}${suffix}` : undefined },
    android: { package: androidIdentifier ? `${androidIdentifier}${suffix}` : undefined },
  }
}
