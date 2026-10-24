// All UI access goes through this adapter. Replace transport methods here when integrating real services.
async function request(path, body) {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '服务暂时不可用');
  return data;
}
export const api = {
  bootstrap: () => request('bootstrap'),
  transactions: scope => request(`transactions?scope=${encodeURIComponent(scope)}`),
  chat: body => request('chat', body),
  confirm: body => request('tasks/confirm', body),
  cancel: taskId => request('tasks/cancel', { taskId }),
  reset: () => request('demo/reset', {}),
};
