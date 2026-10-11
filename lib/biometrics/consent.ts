/**
 * Biometric consent text. Bump CONSENT_VERSION whenever the wording changes; each
 * BiometricConsent row records the version the student agreed to.
 * Review with the institution's legal/data-protection officer before production use.
 */
export const CONSENT_VERSION = "2026-10-v1";

/** Version string stored with the consent; includes the photo-retention variant shown. */
export const consentVersion = (deletesPhotos: boolean) =>
  `${CONSENT_VERSION}${deletesPhotos ? "" : "-photos-kept"}`;

/** The consent text. Retention wording follows the face.deleteRawPhotosAfterEnrollment setting. */
export const consentSections = (deletesPhotos: boolean): { title: string; body: string }[] => [
  {
    title: "What we collect",
    body: "Five photos of your face, taken now, and mathematical face templates (embeddings) computed from them. Classroom photos taken by your teachers are compared against these templates.",
  },
  {
    title: "Why",
    body: "Only to mark class attendance. It is never used for anything else, never sold, and never shared outside the college.",
  },
  {
    title: "Who can see it",
    body: "Nobody. Templates and photos are never shown to students, faculty or administrators — only the attendance system uses them. Your teacher reviews and confirms every attendance result before it counts.",
  },
  {
    title: "How long we keep it",
    body: deletesPhotos
      ? "Your enrollment photos are deleted as soon as the templates are created. Templates are kept while you are enrolled and deleted when you leave, or earlier on request."
      : "Your enrollment photos are stored privately (so templates can be rebuilt if the system is upgraded) and, like the templates, kept while you are enrolled and deleted when you leave, or earlier on request.",
  },
  {
    title: "Your choices",
    body: "You can ask the college office to delete your biometric data at any time. Your attendance will then be marked manually.",
  },
];
