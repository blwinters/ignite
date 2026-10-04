import { ConfigPlugin, withPodfile } from "expo/config-plugins"

const generatedBlock =
  /\n[ \t]*# @generated begin ios-deployment-floor[\s\S]*?# @generated end ios-deployment-floor\n/g

export function addDeploymentFloor(contents: string, deploymentTarget: string): string {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(deploymentTarget)) {
    throw new Error("withIosDeploymentFloor: deploymentTarget must be a numeric iOS version")
  }

  const original = contents.replace(generatedBlock, "")
  const anchor = /^([ \t]+)react_native_post_install\([\s\S]*?^\1\)/m
  if (!anchor.test(original)) {
    throw new Error("withIosDeploymentFloor: could not find the react_native_post_install anchor")
  }

  return original.replace(anchor, (match, indent: string) => {
    const block = [
      "# @generated begin ios-deployment-floor",
      `deployment_floor = Gem::Version.new('${deploymentTarget}')`,
      "installer.pods_project.targets.each do |target|",
      "  target.build_configurations.each do |build_configuration|",
      "    current_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
      "    if current_target.nil? || Gem::Version.new(current_target) < deployment_floor",
      `      build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${deploymentTarget}'`,
      "    end",
      "  end",
      "end",
      "# @generated end ios-deployment-floor",
    ]
      .map((line) => `${indent}${line}`)
      .join("\n")
    return `${match}\n${block}\n`
  })
}

const withIosDeploymentFloor: ConfigPlugin<{ deploymentTarget: string }> = (
  config,
  { deploymentTarget },
) =>
  withPodfile(config, (mod) => {
    mod.modResults.contents = addDeploymentFloor(mod.modResults.contents, deploymentTarget)
    return mod
  })

export default withIosDeploymentFloor
