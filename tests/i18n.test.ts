import { describe, expect, test } from "vitest";
import { setLocale, t } from "../src/game/i18n";

describe("Japanese online translations", () => {
  test("renders online controls and parameterized room status in Japanese", () => {
    expect(t("online.title")).toBe("オンライン2P");
    expect(t("online.mode.coop")).toBe("協力プレイ");
    expect(t("online.mode.race")).toBe("対戦プレイ");
    expect(t("online.room.created", { code: "0429" })).toBe("ルーム0429を作成しました");
    expect(t("online.pause.ready")).toBe("再開準備");
    expect(t("online.connection.syncing")).toBe("通信中…");
  });

  test("renders Traditional Chinese and English and changes the active locale", () => {
    expect(t("online.title", {}, "zh-Hant")).toBe("線上雙人");
    expect(t("online.connection.syncing", {}, "en")).toBe("Syncing…");
    setLocale("en");
    expect(t("menu.options")).toBe("OPTIONS");
    setLocale("ja");
  });
});
