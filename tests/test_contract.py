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


class RouteLockTest(unittest.TestCase):
    def setUp(self):
        self.app = contract.RouteLock()
        self.app.intents = {}
        self.app.ledger = {}
        contract.gl.message.sender_address = OWNER
        contract.gl.message_raw["datetime"] = "2026-11-22T09:00:00Z"
        self.proposed_status = self.reproduced_status = "ALLOW"
        self.issuer_present = True
        self.policy_revision = "known"
        self.rounds = 0
        contract.observe = self.observation
        contract.gl.vm.run_nondet_unsafe = self.consensus

    def observation(self, chain):
        self.rounds += 1
        return {
            "identity": "MATCH" if self.issuer_present else "UNKNOWN",
            "policy": self.proposed_status if self.rounds % 2 else self.reproduced_status,
            "sources": [contract.ROUTES[chain][3], contract.KRAKEN],
            "asset": contract.ROUTES[chain][2], "policy_revision": self.policy_revision,
            "policy_quote": "Focus clause", "issuer_quote": "As listed" if self.issuer_present else "",
        }

    def consensus(self, leader, validator):
        proposal = leader()
        if not validator(SimpleNamespace(calldata=proposal)):
            raise UserError("NO_AGREEMENT")
        return proposal

    def assess(self, key="batch-1", chain=42161):
        self.app.assess(key, chain, contract.ROUTES[chain][2], RECIPIENT, 250000000, REVIEWER, 30)
        return json.loads(self.app.read_intent(OWNER, key))

    def test_unique_review_and_exactly_one_credit(self):
        intent = self.assess()
        self.assertEqual(self.rounds, 2)
        self.assertEqual(intent["status"], "READY")
        with self.assertRaisesRegex(UserError, "REVIEWER_ONLY"):
            self.app.consume(OWNER, "batch-1", intent["permit"])
        contract.gl.message.sender_address = REVIEWER
        with self.assertRaisesRegex(UserError, "PERMIT_MISMATCH"):
            self.app.consume(OWNER, "batch-1", intent["permit"] + "0")
        self.app.consume(OWNER, "batch-1", intent["permit"])
        self.assertEqual(self.app.demo_received(RECIPIENT, 42161), 250000000)
        self.assertEqual(self.app.demo_received(RECIPIENT, 43114), 0)
        self.assertEqual(json.loads(self.app.read_intent(OWNER, "batch-1"))["status"], "CONSUMED")
        with self.assertRaisesRegex(UserError, "INTENT_NOT_READY"):
            self.app.consume(OWNER, "batch-1", intent["permit"])
        self.assertEqual(self.app.demo_received(RECIPIENT, 42161), 250000000)

    def test_blocked_route_cannot_enter_ledger(self):
        self.proposed_status = self.reproduced_status = "BLOCK"
        intent = self.assess(chain=43114)
        self.assertEqual((intent["status"], intent["permit"]), ("BLOCKED", ""))
        contract.gl.message.sender_address = REVIEWER
        with self.assertRaisesRegex(UserError, "INTENT_NOT_READY"):
            self.app.consume(OWNER, "batch-1", "")
        self.assertEqual(self.app.demo_received(RECIPIENT, 43114), 0)

    def test_consensus_disagreement_leaves_no_state(self):
        self.reproduced_status = "BLOCK"
        with self.assertRaisesRegex(UserError, "NO_AGREEMENT"):
            self.assess()
        self.assertEqual(self.app.read_intent(OWNER, "batch-1"), "")

    def test_expiry_is_exclusive(self):
        intent = self.assess()
        contract.gl.message.sender_address = REVIEWER
        contract.gl.message_raw["datetime"] = "2026-11-22T09:30:00Z"
        with self.assertRaisesRegex(UserError, "PERMIT_EXPIRED"):
            self.app.consume(OWNER, "batch-1", intent["permit"])
        self.assertEqual(self.app.demo_received(RECIPIENT, 42161), 0)

    def test_missing_identity_holds_and_reused_key_cannot_overwrite(self):
        self.issuer_present = False
        intent = self.assess()
        self.assertEqual((intent["status"], intent["permit"]), ("REVIEW", ""))
        with self.assertRaisesRegex(UserError, "INTENT_EXISTS"):
            self.assess()
        with self.assertRaisesRegex(UserError, "ASSET_ROUTE_MISMATCH"):
            self.app.assess("other-ref", 43114, contract.ROUTES[42161][2], RECIPIENT, 50, REVIEWER, 30)

    def test_market_policy_focus_and_identity(self):
        title = "Native USD Coin (USDC) on Arbitrum, Optimism and Polygon"
        body = f"{title} Last updated: Oct 19. Test clause. These materials are for general information Footer."
        self.assertEqual(contract.policy_text(body), f"{title} Last updated: Oct 19. Test clause. ")
        self.assertTrue(contract.issuer_evidence(f"Arbitrum {contract.ROUTES[42161][2]}", 42161))
        self.assertTrue(contract.issuer_evidence(f"USDC on Avalanche vs. USDC.e {contract.ROUTES[43114][2]} USDC.e is a bridged form of Ethereum USDC", 43114))
        self.assertFalse(contract.issuer_evidence(f"Base {contract.ROUTES[42161][2]}", 42161))

    def test_material_fields_take_precedence_over_quote_variation(self):
        left = self.observation(42161)
        right = dict(left, policy_quote="Another independently grounded sentence")
        self.assertTrue(contract.equivalent(left, right))
        self.assertFalse(contract.equivalent(left, dict(right, policy_revision="changed")))
        self.assertFalse(contract.equivalent(left, dict(right, policy="BLOCK")))
