import React, { useState } from "react";

const Speedometer = ({
  loaded = 0,
  total = 100,
  label = "Loaded",
  totalLabel = "",
  balanceTotalLabel = ""
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const balance = Math.max(total - loaded, 0);
  const percent = total > 0 ? Math.min(loaded / total, 1) : 0;
  const angle = percent * 180;

  // -------- Size tuned for Dashboard --------
  const width = 520;
  const height = 300;

  const cx = width / 2;
  const cy = 260;

  const radius = 180;
  const stroke = 80;

  // Arc end positions (for label anchoring)
  const leftEndX = cx - radius;
  const rightEndX = cx + radius;
  const labelY = cy + 10; // just below arc

  // Polar → Cartesian
  const polar = (deg, r = radius) => {
    const rad = (deg - 180) * Math.PI / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  };

  const arc = (start, end) => {
    const s = polar(end);
    const e = polar(start);
    const large = end - start <= 180 ? 0 : 1;

    return `M ${s.x} ${s.y}
            A ${radius} ${radius} 0 ${large} 0 ${e.x} ${e.y}`;
  };

  const split = angle;

  // Arrow
  const arrowRad = (split - 180) * Math.PI / 180;
  const arrowLen = radius - 15;
  const ax = cx + arrowLen * Math.cos(arrowRad);
  const ay = cy + arrowLen * Math.sin(arrowRad);

  // Tooltip handler
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      style={styles.container}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handleMouseMove}
    >
      <svg width={width} height={height}>

        {/* Balance */}
        <path
          d={arc(split, 180)}
          stroke="#8b8f94"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="butt"
        />

        {/* Loaded */}
        <path
          d={arc(0, split)}
          stroke="#0b3a78"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="butt"
        />

        {/* Inner base */}
        <path
          d={`
            M ${cx - 95} ${cy}
            A 95 95 0 0 1 ${cx + 95} ${cy}
            L ${cx} ${cy}
            Z
          `}
          fill="#9ea1a6"
        />

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={ax}
          y2={ay}
          stroke="#1ea7e1"
          strokeWidth="3"
        />

        <polygon
          points={`${ax},${ay}
                   ${ax - 10},${ay + 16}
                   ${ax + 10},${ay + 16}`}
          fill="#1ea7e1"
          transform={`rotate(${split - 90} ${ax} ${ay})`}
        />

        {/* Title */}
        <text
          x={cx}
          y="22"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
        >
          {label}
        </text>
      </svg>

      {/* Left label - Total */}
      <div
        style={{
          position: "absolute",
          left: leftEndX - 70,
          top: labelY,
          width: 130,
          fontSize: "13px",
          fontWeight: 800,
          lineHeight: "16px",
          textAlign: "center"
        }}
      >
        {totalLabel}
        <div style={{ fontSize: "18px", fontWeight: 900, marginTop: "4px", color: "#0b3a78" }}>
          {total}
        </div>
      </div>

      {/* Right label - Balance */}
      <div
        style={{
          position: "absolute",
          left: rightEndX - 62,
          top: labelY,
          width: 130,
          fontSize: "13px",
          fontWeight: 800,
          lineHeight: "16px",
          textAlign: "center"
        }}
      >
        {balanceTotalLabel}
        <div style={{ fontSize: "18px", fontWeight: 900, marginTop: "4px", color: "#8b8f94" }}>
          {balance}
        </div>
      </div>

      {/* Tooltip on hover */}
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 36,
            background: "rgba(0, 0, 0, 0.85)",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {loaded} / {total}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    width: "520px",
    height: "330px",
    position: "relative",
    flexShrink: 0,
    cursor: "pointer",
  }
};

export default Speedometer;
