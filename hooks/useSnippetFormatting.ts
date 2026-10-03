import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectLanguage,
  MIN_DETECTION_CONFIDENCE,
  type DetectionResult,
} from "@/lib/language-detection";
import {
  formatCode,
  FORMATTER_LABELS,
  isFormattingAvailable,
} from "@/lib/format-code";
import { getLanguageLabel, PLAIN_TEXT_LANGUAGE } from "@/lib/languages";

export interface FormatStatus {
  type: "success" | "info" | "error";
  message: string;
}

export interface UseSnippetFormattingOptions {
  /** Current snippet code (read at format time). */
  getCode: () => string;
  /** Current snippet language (read at format time). */
  getLanguage: () => string;
  /** Apply a language confirmed by detection (writes it to the form). */
  applyLanguage: (language: string) => void;
  /** Write formatted code back to the form. */
  applyCode: (code: string) => void;
  /** Debounce for auto-formatting after language confirmation. */
  autoFormatDelay?: number;
}

export interface UseSnippetFormattingReturn {
  /** Pending language suggestion from a paste, or null. */
  suggestion: DetectionResult | null;
  autoFormat: boolean;
  formatting: boolean;
  formatStatus: FormatStatus | null;
  handlePaste: (text: string) => void;
  acceptSuggestion: () => void;
  dismissSuggestion: () => void;
  /** Call when the user explicitly picks a language — locks detection. */
  handleLanguageSelect: (language: string) => void;
  /** Lock detection without changing the language (e.g. editing an existing snippet). */
  lockDetection: () => void;
  setAutoFormat: (enabled: boolean) => void;
  formatNow: () => Promise<void>;
  clearFormatStatus: () => void;
}

const DEFAULT_AUTO_FORMAT_DELAY = 400;

export function useSnippetFormatting(
  options: UseSnippetFormattingOptions,
): UseSnippetFormattingReturn {
  const [suggestion, setSuggestion] = useState<DetectionResult | null>(null);
  const [autoFormat, setAutoFormatState] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [formatStatus, setFormatStatus] = useState<FormatStatus | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const suggestionRef = useRef<DetectionResult | null>(null);
  suggestionRef.current = suggestion;

  const autoFormatRef = useRef(autoFormat);
  autoFormatRef.current = autoFormat;

  const lockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const formatNow = useCallback(async (languageOverride?: string) => {
    const { getCode, getLanguage, applyCode } = optionsRef.current;
    const code = getCode();
    const language = (languageOverride ?? getLanguage()).toLowerCase();

    if (!code || code.trim().length === 0) {
      setFormatStatus({ type: "info", message: "Nothing to format." });
      return;
    }
    if (!isFormattingAvailable(language)) {
      setFormatStatus({
        type: "info",
        message: `Formatting is not available for ${getLanguageLabel(language)} — select a supported language to format.`,
      });
      return;
    }

    setFormatting(true);
    try {
      const result = await formatCode(code, language);
      if (!result.ok) {
        setFormatStatus({
          type: "error",
          message: result.error ?? "Formatting failed. Your code was left unchanged.",
        });
        return;
      }
      if (result.changed) applyCode(result.code);
      setFormatStatus({
        type: "success",
        message: result.changed
          ? `Formatted with ${FORMATTER_LABELS[result.formatter]}.`
          : "Code is already formatted.",
      });
    } catch {
      setFormatStatus({
        type: "error",
        message: "Formatting failed. Your code was left unchanged.",
      });
    } finally {
      setFormatting(false);
    }
  }, []);

  const scheduleAutoFormat = useCallback(
    (language: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const delay = optionsRef.current.autoFormatDelay ?? DEFAULT_AUTO_FORMAT_DELAY;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void formatNow(language);
      }, delay);
    },
    [formatNow],
  );

  const handlePaste = useCallback((text: string) => {
    if (lockedRef.current) return; // explicit user choice wins over detection
    if (!text || text.trim().length === 0) {
      setSuggestion(null);
      return;
    }
    const result = detectLanguage(text);
    if (
      result.language !== PLAIN_TEXT_LANGUAGE &&
      result.confidence >= MIN_DETECTION_CONFIDENCE
    ) {
      setSuggestion(result);
    } else {
      // Low confidence → plain-text fallback: no suggestion is shown.
      setSuggestion(null);
    }
  }, []);

  const acceptSuggestion = useCallback(() => {
    const current = suggestionRef.current;
    if (!current) return;
    suggestionRef.current = null;
    setSuggestion(null);
    optionsRef.current.applyLanguage(current.language);
    if (autoFormatRef.current) scheduleAutoFormat(current.language);
  }, [scheduleAutoFormat]);

  const dismissSuggestion = useCallback(() => {
    suggestionRef.current = null;
    setSuggestion(null);
  }, []);

  const handleLanguageSelect = useCallback(
    (language: string) => {
      lockedRef.current = true; // manual selection locks detection
      setSuggestion(null);
      if (autoFormatRef.current) scheduleAutoFormat(language);
    },
    [scheduleAutoFormat],
  );

  const lockDetection = useCallback(() => {
    lockedRef.current = true;
  }, []);

  const setAutoFormat = useCallback(
    (enabled: boolean) => {
      setAutoFormatState(enabled);
      autoFormatRef.current = enabled;
      if (!enabled && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const clearFormatStatus = useCallback(() => setFormatStatus(null), []);

  return {
    suggestion,
    autoFormat,
    formatting,
    formatStatus,
    handlePaste,
    acceptSuggestion,
    dismissSuggestion,
    handleLanguageSelect,
    lockDetection,
    setAutoFormat,
    formatNow: () => formatNow(),
    clearFormatStatus,
  };
}
