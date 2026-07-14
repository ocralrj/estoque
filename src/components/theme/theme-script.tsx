/**
 * Script inline para evitar flash de tema errado no carregamento.
 * Deve rodar antes da hidratação do React.
 */
export function ThemeScript() {
  const code = `
(function(){
  try {
    var k = 'ocral-theme';
    var t = localStorage.getItem(k);
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var r = document.documentElement;
    if (t === 'dark') r.classList.add('dark');
    else r.classList.remove('dark');
    r.style.colorScheme = t;
    r.dataset.theme = t;
  } catch (e) {}
})();
`;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: code }}
      // eslint-disable-next-line react/no-danger
    />
  );
}
