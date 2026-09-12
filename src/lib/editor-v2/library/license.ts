import type { AssetLicenseMetadata } from "../types";
import type { LibraryItem } from "./types";

export function validateAssetLicense(license: AssetLicenseMetadata): string[] {
  const errors: string[] = [];
  if (!license.provider.trim()) errors.push("provider é obrigatório");
  if (!license.sourceUrl.trim()) errors.push("sourceUrl é obrigatório");
  if (!license.licenseType.trim() || license.licenseType.toLowerCase() === "unknown") errors.push("licença conhecida é obrigatória");
  if (!license.licenseUrl.trim()) errors.push("licenseUrl é obrigatório");
  if (!license.author.trim()) errors.push("author é obrigatório");
  return errors;
}

export function canPublishBuiltIn(item: LibraryItem): boolean {
  return item.source === "built-in" && validateAssetLicense(item.license).length === 0 && item.license.commercialUseAllowed;
}

