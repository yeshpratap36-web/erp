/** Date → "YYYY-MM-DD" for <input type="date"> (dates are stored at UTC midnight). */
export const toDateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export const formatDate = (d: Date | null | undefined) => (d ? dateFmt.format(d) : "—");

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
export const formatDateTime = (d: Date | null | undefined) => (d ? dateTimeFmt.format(d) : "—");
