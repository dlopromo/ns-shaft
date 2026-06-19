import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import { get, limitToLast, orderByChild, query, ref, set } from "firebase/database";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-ns-shaft",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: await readFile(new URL("../database.rules.json", import.meta.url), "utf8")
    }
  });
});

beforeEach(() => environment.clearDatabase());
after(() => environment.cleanup());

const validScore = (uid) => ({
  uid,
  player1: "PLAYER1",
  floor: 18,
  createdAt: { ".sv": "timestamp" }
});

test("only authenticated users can use four-digit namespaced rooms", async () => {
  const authenticated = environment.authenticatedContext("uid-1").database();
  const anonymous = environment.unauthenticatedContext().database();
  await assertSucceeds(set(ref(authenticated, "ns-shaft/rooms/1234"), { meta: { createdAt: 1 } }));
  await assertFails(set(ref(authenticated, "rooms/1234"), { meta: {} }));
  await assertFails(set(ref(authenticated, "ns-shaft/rooms/12345"), { meta: {} }));
  await assertFails(get(ref(anonymous, "ns-shaft/rooms/1234")));
});

test("leaderboards accept valid create-only own-user submissions", async () => {
  const database = environment.authenticatedContext("uid-1").database();
  const path = "ns-shaft/leaderboards/solo/normal/submission-1";
  await assertSucceeds(set(ref(database, path), validScore("uid-1")));
  await assertFails(set(ref(database, path), validScore("uid-1")));
  await assertFails(set(ref(database, `${path}-spoof`), validScore("uid-2")));
  await assertFails(set(ref(database, `${path}-extra`), { ...validScore("uid-1"), cheat: true }));
});

test("authenticated clients can query the indexed top five", async () => {
  const database = environment.authenticatedContext("uid-1").database();
  await set(ref(database, "ns-shaft/leaderboards/race/hard/a"), validScore("uid-1"));
  await assertSucceeds(get(query(
    ref(database, "ns-shaft/leaderboards/race/hard"),
    orderByChild("floor"),
    limitToLast(5)
  )));
});
