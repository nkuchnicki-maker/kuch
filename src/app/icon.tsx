import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          borderRadius: 6,
        }}
      >
        <svg width={26} height={26} viewBox="0 0 32 32" fill="none">
          <path
            d="M16 2 L29 8 V16 C29 23.5 23.5 28.8 16 30 C8.5 28.8 3 23.5 3 16 V8 Z"
            fill="#10b981"
          />
          <path
            d="M16 6 L25 10.2 V16 C25 21.3 21.3 25 16 26 C10.7 25 7 21.3 7 16 V10.2 Z"
            fill="#020617"
          />
          <path
            d="M12 15.5 L15 18.5 L20.5 12.5"
            stroke="#10b981"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
