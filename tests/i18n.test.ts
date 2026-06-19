import { describe, expect, test } from "vitest";
import { t } from "../src/game/i18n";

describe("Japanese online translations", () => {
  test("renders online controls and parameterized room status in Japanese", () => {
    expect(t("online.title")).toBe("オンライン2P");
    expect(t("online.mode.coop")).toBe("協力プレイ");
    expect(t("online.mode.race")).toBe("対戦プレイ");
    expect(t("online.room.created", { code: "0429" })).toBe("ルーム0429を作成しました");
    expect(t("online.pause.ready")).toBe("再開準備");
    expect(t("online.connection.syncing")).toBe("通信中…");
  });
});
