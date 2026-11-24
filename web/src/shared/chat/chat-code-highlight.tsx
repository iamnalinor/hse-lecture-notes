import { loadLanguage, type ShjLanguage, tokenize } from "@speed-highlight/core";
import cGrammar from "@speed-highlight/core/languages/c.js";
import { type JSX, type ReactNode, useEffect, useState } from "react";

// The library accepts registered language names at runtime but types only its built-ins.
const cpp = "cpp" as ShjLanguage;
loadLanguage(cpp, {
  default: [
    {
      type: "kwd",
      match: /\b(?:catch|throw|try|co_await|co_return|co_yield|new|delete|this|operator)\b/g,
    },
    {
      type: "kwd",
      match:
        /\b(?:class|template|typename|concept|namespace|using|requires|export|friend|public|protected|private)\b/g,
    },
    {
      type: "kwd",
      match:
        /\b(?:alignas|alignof|consteval|constexpr|constinit|explicit|inline|mutable|noexcept|override|static_assert|thread_local|virtual)\b/g,
    },
    { type: "kwd", match: /\b(?:const_cast|dynamic_cast|reinterpret_cast|static_cast|typeid)\b/g },
    { type: "type", match: /\b(?:bool|decltype|wchar_t|char8_t|char16_t|char32_t)\b/g },
    { type: "bool", match: /\b(?:true|false|nullptr)\b/g },
    ...cGrammar,
  ],
});

const languages = new Map<string, ShjLanguage>([
  ["c", "c"],
  ["h", "c"],
  ["cpp", cpp],
  ["c++", cpp],
  ["cc", cpp],
  ["hpp", cpp],
  ["python", "py"],
  ["py", "py"],
  ["javascript", "js"],
  ["js", "js"],
  ["jsx", "js"],
  ["typescript", "ts"],
  ["ts", "ts"],
  ["tsx", "ts"],
  ["json", "json"],
  ["rust", "rs"],
  ["rs", "rs"],
  ["go", "go"],
  ["java", "java"],
  ["bash", "bash"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["sql", "sql"],
  ["html", "html"],
  ["xml", "xml"],
  ["css", "css"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],
  ["lua", "lua"],
  ["asm", "asm"],
  ["dockerfile", "docker"],
  ["makefile", "make"],
  ["diff", "diff"],
  ["markdown", "md"],
]);

type Props = { readonly code: string; readonly lang: string };

export const ChatCodeHighlight = ({ code, lang }: Props): JSX.Element => {
  const language = languages.get(lang.trim().toLowerCase());
  const [result, setResult] = useState<{
    code: string;
    language: ShjLanguage;
    nodes: ReactNode[];
  }>();
  useEffect(() => {
    if (language === undefined) {
      return;
    }
    let isActive = true;
    let offset = 0;
    const nodes: ReactNode[] = [];
    const highlight = async (): Promise<void> => {
      await tokenize(code, language, (text, kind) => {
        if (text === "") {
          return;
        }
        nodes.push(
          kind === undefined ? (
            text
          ) : (
            <span data-syntax={kind} key={offset}>
              {text}
            </span>
          ),
        );
        offset += text.length;
      });
      if (isActive) {
        setResult({ code, language, nodes });
      }
    };
    void highlight();
    return () => {
      isActive = false;
    };
  }, [code, language]);
  return <>{result?.code === code && result.language === language ? result.nodes : code}</>;
};
