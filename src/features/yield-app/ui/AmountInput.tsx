import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import { C, F } from "./theme";

function withCommas(raw: string) {
  const [i, d] = raw.split(".");
  const int = (i || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${int}.${d}` : int;
}

function toRaw(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** 60px editable amount that looks exactly like the static "$1,000" in the design. */
export function AmountInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [raw, setRaw] = useState(() => toRaw(value));
  useEffect(() => {
    if (Number(raw || 0) !== value) setRaw(toRaw(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const display = "$" + withCommas(raw);
  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType="decimal-pad"
      returnKeyType="done"
      autoComplete="off"
      autoCorrect={false}
      contextMenuHidden
      selectionColor={C.blue}
      cursorColor={C.blue}
      value={display}
      selection={{ start: display.length, end: display.length }}
      maxFontSizeMultiplier={1}
      onChangeText={(t) => {
        let r = t.replace(/[^0-9.]/g, "");
        const dot = r.indexOf(".");
        if (dot >= 0) r = r.slice(0, dot + 1) + r.slice(dot + 1).replace(/\./g, "").slice(0, 2);
        r = r.slice(0, 12);
        setRaw(r);
        onChange(Number(r || 0));
      }}
      style={{
        alignSelf: "stretch",
        height: 64,
        padding: 0,
        textAlign: "center",
        fontFamily: F[700],
        fontSize: display.length > 9 ? 48 : 60,
        letterSpacing: -2.4,
        color: C.ink,
        fontVariant: ["tabular-nums"],
        includeFontPadding: false,
      }}
    />
  );
}
