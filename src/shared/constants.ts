export const LINKEDIN_URL = "https://www.linkedin.com/in/nurfarhad/" as const;

export const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube"
} as const;

export const DEVELOPMENT =
  typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
