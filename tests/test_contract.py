from datetime import datetime
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace, ModuleType
import unittest


class UserError(Exception):
    pass


OWNER = "0x" + "1" * 40
REVIEWER = "0x" + "2" * 40
RECIPIENT = "0x" + "3" * 40

genlayer = ModuleType("genlayer")
genlayer.TreeMap = dict
genlayer.u256 = int
genlayer.allow_storage = lambda cls: cls
genlayer.gl = SimpleNamespace(
    Contract=object,
    public=SimpleNamespace(view=lambda function: function, write=lambda function: function),
    vm=SimpleNamespace(UserError=UserError),
    message=SimpleNamespace(sender_address=OWNER, contract_address="0x" + "5" * 40),
    message_raw={"datetime": "2026-11-22T09:00:00Z"},
)
sys.modules["genlayer"] = genlayer
spec = importlib.util.spec_from_file_location("routelock", Path(__file__).parents[1] / "contracts" / "routelock.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


NATIVE_ASSET = contract.ROUTES[42161][2]
BRIDGED_ASSET = contract.ROUTES[43114][2]
ARB_BRIDGED = contract.SUNSET_ASSETS[42161]


def when(day):
    return int(datetime.fromisoformat(day + "T12:00:00+00:00").timestamp())


class RouteLockTest(unittest.TestCase):
    def setUp(self):
        self.app = contract.RouteLock()
        self.app.intents = {}
        self.app.ledger = {}
        contract.gl.message.sender_address = OWNER
        contract.gl.message_raw["datetime"] = "2026-11-22T09:00:00Z"
        self.rounds = 0
        self.renders = []
        self.model_override = None
        self.validator_pages = {}
        self.pages = {
            contract.ISSUER: f"<table><tr><td>Arbitrum</td><td>{NATIVE_ASSET}</td></tr></table>",
            contract.BRIDGE: (
                '<h2>USDC on Avalanche vs. USDC.e</h2>'
                f'<a href="https://snowtrace.io/token/{BRIDGED_ASSET}">USDC.e</a> '
                'on Avalanche is a "bridged form of Ethereum USDC"'
            ),
            contract.KRAKEN: (
                f"<h1>{contract.BASE_TITLE}</h1><p>Last updated: 19 October 2026</p>"
                f"<p>{contract.BASE_NATIVE}</p><p>{contract.BASE_BRIDGED}</p>"
                f"<p>{contract.BASE_AVALANCHE}</p><footer>These materials are for general information</footer>"
            ),
            contract.NOTICE: (
                f"<h1>{contract.NOTICE_TITLE}</h1><p>Last updated: November 5, 2026</p>"
                f"<p>{contract.NOTICE_SCOPE}</p><p>{contract.NOTICE_NATIVE}</p>"
                + "".join(f"<p>{rule[1]}</p>" for rule in contract.SUNSETS.values())
                + "".join(f"<p>{token}</p>" for token in contract.SUNSET_ASSETS.values())
                + "<footer>Create account</footer>"
            ),
        }
        contract.gl.nondet = SimpleNamespace(web=SimpleNamespace(render=self.render), exec_prompt=self.prompt)
        contract.gl.vm.run_nondet_unsafe = self.consensus
        self.real_pins = contract.ARTICLE_HASHES.copy()
        self.addCleanup(contract.ARTICLE_HASHES.update, self.real_pins)
        _, self.base, self.notice = self.articles_and_pins()

    def render(self, url, mode):
        self.renders.append((self.rounds, url))
        self.assertEqual(mode, "html")
        body = self.validator_pages.get(url, self.pages[url]) if self.rounds == 2 else self.pages[url]
        if isinstance(body, Exception):
            raise body
        return body

    def prompt(self, prompt, response_format):
        self.assertEqual(response_format, "json")
        candidate = json.loads(prompt.split("\nCANDIDATE=", 1)[1].split("\nSOURCES=", 1)[0])
        return {"status": self.model_override or candidate[0]}

    def articles_and_pins(self):
        base = contract.policy_article(contract.text_at(contract.KRAKEN), contract.BASE_TITLE,
                                       "19 October 2026", "These materials are for general information",
                                       contract.BASE_VERSION, contract.KRAKEN)[1]
        notice = contract.policy_article(contract.text_at(contract.NOTICE), contract.NOTICE_TITLE,
                                         "November 5, 2026", "Create account", contract.NOTICE_VERSION,
                                         contract.NOTICE)[1]
        for ref in (base, notice):
            contract.ARTICLE_HASHES[ref["url"]] = ref["sha256"]
        bodies = [contract.policy_article(contract.text_at(ref["url"]), title, day, marker, ref["updated"], ref["url"])[0]
                  for ref, title, day, marker in (
                      (base, contract.BASE_TITLE, "19 October 2026", "These materials are for general information"),
                      (notice, contract.NOTICE_TITLE, "November 5, 2026", "Create account"),
                  )]
        self.renders.clear()
        return (base, notice), *bodies

    def consensus(self, leader, validator):
        self.rounds = 1
        proposal = leader()
        self.rounds = 2
        if not validator(SimpleNamespace(calldata=proposal)):
            raise UserError("NO_AGREEMENT")
        return proposal

    def assess(self, key="batch-1", chain=42161, revision=0):
        self.app.assess(key, chain, contract.ROUTES[chain][2], RECIPIENT, 250000000, REVIEWER, 30, revision)
        return json.loads(self.app.read_intent(OWNER, key))

    def test_unique_reviewer_and_exactly_one_credit(self):
        intent = self.assess()
        self.assertEqual(intent["status"], "READY")
        expected = [contract.ISSUER, contract.KRAKEN, contract.NOTICE]
        self.assertEqual(self.renders, [(party, url) for party in (1, 2) for url in expected])
        with self.assertRaisesRegex(UserError, "REVIEWER_ONLY"):
            self.app.consume(OWNER, "batch-1", intent["permit"])
        contract.gl.message.sender_address = REVIEWER
        with self.assertRaisesRegex(UserError, "PERMIT_MISMATCH"):
            self.app.consume(OWNER, "batch-1", intent["permit"] + "0")
        self.app.consume(OWNER, "batch-1", intent["permit"])
        self.assertEqual(self.app.demo_received(RECIPIENT, 42161), 250000000)
        self.assertEqual(self.app.demo_received(RECIPIENT, 43114), 0)
        with self.assertRaisesRegex(UserError, "INTENT_NOT_READY"):
            self.app.consume(OWNER, "batch-1", intent["permit"])
        contract.gl.message.sender_address = OWNER
        with self.assertRaisesRegex(UserError, "INTENT_ALREADY_CONSUMED"):
            self.assess(revision=1)

    def test_kraken_date_format_preserves_pinned_body(self):
        original = self.pages[contract.KRAKEN]
        localized = original.replace("19 October 2026", "October 19, 2026")
        self.pages[contract.KRAKEN] = localized
        self.assertEqual(self.assess()["status"], "READY")
        self.assertEqual(self.assess("avax-1", chain=43114)["status"], "BLOCKED")

        self.pages[contract.KRAKEN] = localized.replace("October 19, 2026", "October 20, 2026")
        self.assertEqual(self.assess("changed-date")["status"], "REVIEW")
        self.pages[contract.KRAKEN] = localized.replace("<footer>", "<p>Deposit terms changed.</p><footer>")
        self.assertEqual(self.assess("changed-body")["status"], "REVIEW")

    def test_notice_does_not_block_native_or_apply_to_avalanche(self):
        native = self.assess()
        bridged = self.assess(key="avax-1", chain=43114)
        self.assertEqual((native["status"], bridged["status"]), ("READY", "BLOCKED"))
        self.assertEqual(bridged["permit"], "")
        self.assertEqual(bridged["evidence"]["policy_source"], contract.KRAKEN)
        self.assertNotEqual(native["evidence"]["versions"][0], bridged["evidence"]["versions"][0])
        for intent in (native, bridged):
            evidence = intent["evidence"]
            self.assertEqual((evidence["asset"], evidence["chain"], evidence["operation"]),
                             (intent["token"], intent["chain"], "deposit"))
        with self.assertRaisesRegex(UserError, "ASSET_ROUTE_MISMATCH"):
            self.app.assess("arb-bridge", 42161, ARB_BRIDGED, RECIPIENT, 50, REVIEWER, 30, 0)

    def test_later_dated_notice_supersedes_old_bridged_support_by_operation(self):
        for chain, token in contract.SUNSET_ASSETS.items():
            decide = lambda operation, day: contract.policy_rule(chain, token, operation, when(day),
                                                                  self.base, self.notice)
            self.assertEqual(decide("deposit", "2026-11-12")[0], "ALLOW")
            self.assertIsNone(decide("deposit", "2026-11-16"))
            self.assertEqual(decide("deposit", "2026-11-22")[0:3:2], ("BLOCK", "2026-11-16"))
            self.assertEqual(decide("withdrawal", "2026-11-22")[0], "ALLOW")
            self.assertEqual(decide("withdrawal", "2026-12-20")[0:3:2], ("BLOCK", "2026-12-14"))
            self.assertEqual(decide("deposit", "2026-12-20")[2], "2026-11-16")

    def test_withdrawal_only_page_cannot_authorize_deposit(self):
        self.pages[contract.NOTICE] = self.pages[contract.NOTICE].replace(contract.SUNSETS["deposit"][1], "")
        self.articles_and_pins()
        self.assertEqual(self.assess()["status"], "REVIEW")

    def test_missing_unavailable_or_conflicting_source_requires_review(self):
        cases = [
            (contract.ISSUER, "Sign in"),
            (contract.NOTICE, OSError("no response")),
            (contract.KRAKEN, "<h1>No article</h1>"),
            (contract.KRAKEN, self.pages[contract.KRAKEN].replace("<footer>", "<p>Native deposits are suspended.</p><footer>")),
        ]
        for index, (url, content) in enumerate(cases):
            with self.subTest(url=url, index=index):
                original = self.pages[url]
                self.pages[url] = content
                intent = self.assess(f"case-{index}")
                self.assertEqual((intent["status"], intent["permit"]), ("REVIEW", ""))
                self.pages[url] = original

    def test_different_page_version_cannot_reach_consensus(self):
        self.validator_pages[contract.KRAKEN] = self.pages[contract.KRAKEN].replace("19 October", "20 October")
        with self.assertRaisesRegex(UserError, "NO_AGREEMENT"):
            self.assess()
        self.assertEqual(self.app.read_intent(OWNER, "batch-1"), "")
        original = contract.observe(42161, when("2026-11-22"))
        self.assertFalse(contract.equivalent(original, dict(original, policy_date="2026-11-05")))
        self.assertFalse(contract.equivalent(original, dict(original, operation="withdrawal")))

    def test_model_ambiguity_cannot_issue_a_permit(self):
        self.model_override = "REVIEW"
        self.assertEqual(self.assess()["status"], "REVIEW")

    def test_expiry_is_exclusive(self):
        intent = self.assess()
        contract.gl.message.sender_address = REVIEWER
        contract.gl.message_raw["datetime"] = "2026-11-22T09:30:00Z"
        with self.assertRaisesRegex(UserError, "PERMIT_EXPIRED"):
            self.app.consume(OWNER, "batch-1", intent["permit"])

    def test_reassessment_replaces_permit_and_rejects_stale_writes(self):
        first = self.assess()
        with self.assertRaisesRegex(UserError, "INTENT_REVISION_CHANGED"):
            self.assess()
        second = self.assess(revision=1)
        self.assertEqual(second["revision"], 2)
        self.assertNotEqual(second["permit"], first["permit"])
        contract.gl.message.sender_address = REVIEWER
        with self.assertRaisesRegex(UserError, "PERMIT_MISMATCH"):
            self.app.consume(OWNER, "batch-1", first["permit"])
        contract.gl.message.sender_address = OWNER
        self.pages[contract.NOTICE] = OSError("unavailable")
        self.assertEqual(self.assess(revision=2)["status"], "REVIEW")
        contract.gl.message.sender_address = REVIEWER
        with self.assertRaisesRegex(UserError, "INTENT_NOT_READY"):
            self.app.consume(OWNER, "batch-1", second["permit"])
        self.assertEqual(self.app.demo_received(RECIPIENT, 42161), 0)

    def test_issuer_requires_correct_linked_bridged_asset(self):
        self.pages[contract.BRIDGE] = self.pages[contract.BRIDGE].replace(BRIDGED_ASSET, NATIVE_ASSET)
        self.assertEqual(self.assess(chain=43114)["status"], "REVIEW")
