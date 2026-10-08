export const inr = (paise: number | null | undefined, opts: { decimals?: boolean } = {}) =>
  paise === null || paise === undefined ? '—' : '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: opts.decimals || paise % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 });
export const inrWithGst = (paise: number) => inr(Math.round(paise * 1.18));
export const date = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
export const dateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
