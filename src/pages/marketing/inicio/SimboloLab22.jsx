




const R = 17.5;
const DX = 42.4;
const DY = 21;
const CX = [0, 1, 2, 3].map(i => R + i * DX);
const CY = [0, 1, 2, 3].map(j => R + j * DY);

export default function SimboloLab22({ className = '', title = 'Lab22' }) {
  const aneis = [];
  const cheios = [];
  CX.forEach((cx, i) => CY.forEach((cy, j) => {
    const chave = `${i}-${j}`;
    if (i === j) aneis.push(<circle key={chave} cx={cx} cy={cy} r={R - 0.7} fill="none" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.3" />);
    else cheios.push(<circle key={chave} cx={cx} cy={cy} r={R} fill="currentColor" />);
  }));
  return (
    <svg viewBox={`0 0 ${CX[3] + R} ${CY[3] + R}`} className={className} role="img" aria-label={title}>
      {aneis}
      {cheios}
    </svg>
  );
}
