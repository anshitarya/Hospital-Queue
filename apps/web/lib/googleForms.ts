export function submitGoogleForm(actionUrl: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.action = actionUrl;
  form.method = 'POST';
  form.target = '_blank';
  form.rel = 'noopener noreferrer';

  for (const [name, value] of Object.entries(fields)) {
    if (!name || !value.trim()) continue;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value.trim();
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}
