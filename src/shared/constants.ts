export const LINKEDIN_URL = "https://www.linkedin.com/in/nurfarhad/" as const;
export const FACEBOOK_URL = "https://www.facebook.com/itsnurfarhad/" as const;
export const OWN_PAGE_URL = "https://own.page/nurfarhad" as const;

export const PLATFORM_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube"
} as const;

export const DEVELOPMENT =
  typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
