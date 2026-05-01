export function firstReflectionDate(signupDate: Date): Date {
  const earliest = new Date(signupDate);
  earliest.setDate(earliest.getDate() + 7);
  // Find next Sunday on or after `earliest`. Sunday = 0 in JS.
  const daysToAdd = (7 - earliest.getDay()) % 7;
  const result = new Date(earliest);
  result.setDate(earliest.getDate() + daysToAdd);
  return result;
}

export function formatReflectionDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  // e.g. "Sunday, May 10"
}
