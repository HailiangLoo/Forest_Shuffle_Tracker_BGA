import json
import random
import requests
from enum import Enum
from typing import List, Optional, Dict, Any, Tuple

# =========================================================================
# 1. 基础数据结构与静态图鉴 (Static DB & Data Structures)
# =========================================================================

def load_card_db(filepath="d:\\森森不息\\card_db.json") -> Dict[int, Dict]:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    db = {}
    current_id = 1
    
    # Process Woody Plants
    for wp in data.get('woodyPlants', []):
        for v in wp['variants']:
            count = v.get('count')
            count = count if count is not None else 1
            for _ in range(count):
                db[current_id] = {
                    'id': current_id, 'name': wp['name'], 'category': 'woodyPlant',
                    'cost': wp['cost'], 'types': wp['types'] + v.get('extraTypes', []),
                    'treeSymbol': v['treeSymbol'], 'gameBox': v['gameBox'],
                    'position': 'NONE'
                }
                current_id += 1
                
    # Process Dwellers
    for d in data.get('dwellers', []):
        for v in d['variants']:
            count = v.get('count')
            count = count if count is not None else 1
            for _ in range(count):
                db[current_id] = {
                    'id': current_id, 'name': d['name'], 'category': 'dweller',
                    'cost': d['cost'], 'types': d['types'] + v.get('extraTypes', []),
                    'position': v['position'], 'treeSymbol': v['treeSymbol'],
                    'gameBox': v['gameBox']
                }
                current_id += 1
                
    # We ignore standard caves during initial iteration, assuming base caves
    return db

# Global DB loaded at module import
CARD_DB = load_card_db()

class CardSide(Enum):
    TOP = "TOP"
    BOTTOM = "BOTTOM"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    NONE = "NONE"

class Tree:
    def __init__(self, tree_id: int):
        self.base_id = tree_id
        self.slots: Dict[str, List[int]] = {
            "TOP": [], "BOTTOM": [], "LEFT": [], "RIGHT": []
        }

    def can_attach(self, side: str) -> bool:
        # Most slots hold only 1 card, but insects/butterflies might share. Simplified for now:
        # TODO: Implement strict sharing rules based on JS modifiers
        return len(self.slots[side]) == 0 or "INSECT" in CARD_DB[self.slots[side][0]].get('types', [])

    def attach(self, target_id: int, side: str):
        self.slots[side].append(target_id)

    def to_typescript_json(self) -> Dict:
        base_def = CARD_DB[self.base_id]
        return {
            "name": base_def["name"],
            "types": base_def["types"],
            "treeSymbol": base_def.get("treeSymbol"),
            "dwellers": {
                "TOP": [{"name": CARD_DB[cid]["name"], "types": CARD_DB[cid]["types"]} for cid in self.slots["TOP"]],
                "BOTTOM": [{"name": CARD_DB[cid]["name"], "types": CARD_DB[cid]["types"]} for cid in self.slots["BOTTOM"]],
                "LEFT": [{"name": CARD_DB[cid]["name"], "types": CARD_DB[cid]["types"]} for cid in self.slots["LEFT"]],
                "RIGHT": [{"name": CARD_DB[cid]["name"], "types": CARD_DB[cid]["types"]} for cid in self.slots["RIGHT"]],
            }
        }

class Forest:
    def __init__(self):
        self.trees: List[Tree] = []
        self.cave_counts = 0 # Count cards tucked in cave

    def add_tree(self, tree_id: int):
        self.trees.append(Tree(tree_id))
        
    def get_available_slots(self, side: str) -> List[int]:
        return [i for i, tree in enumerate(self.trees) if tree.can_attach(side)]
        
    def to_typescript_json(self) -> Dict:
        return {
            "woodyPlants": [t.to_typescript_json() for t in self.trees],
            "cave": {
                "name": "REGULAR_CAVE",
                "gameBox": "BASE",
                "cardCount": self.cave_counts
            }
        }


# =========================================================================
# 2. 动作与游戏状态 (Action & Game State)
# =========================================================================

class ActionType(Enum):
    DRAW_FROM_DECK = "draw_deck"
    DRAW_FROM_CLEARING = "draw_clearing"
    PLAY_TREE = "play_tree"
    PLAY_CARD = "play_card"

class Action:
    def __init__(self, action_type: ActionType, target_id: int = -1, side: str = "NONE", tree_index: int = -1, payment_ids: List[int] = None):
        self.action_type = action_type
        self.target_id = target_id
        self.side = side
        self.tree_index = tree_index
        self.payment_ids = payment_ids if payment_ids else []

class ForestShuffleState:
    def __init__(self, num_players: int):
        self.num_players = num_players
        self.clearing: List[int] = []
        self.deck: List[int] = list(CARD_DB.keys())
        random.shuffle(self.deck)
        
        # Inject winter cards (Simplified 3 winter concept)
        # Actually standard rules divide deck into piles and insert winter cards into bottom piles.
        
        self.winter_cards_seen = 0
        self.player_forests: List[Forest] = [Forest() for _ in range(num_players)]
        self.player_hands: List[List[int]] = [[] for _ in range(num_players)]
        
        self._current_player = 0
        self._is_terminal = False
        
        # Deal initial hands (6 cards each)
        for p in range(num_players):
            for _ in range(6):
                self._draw_from_deck(p)

    def current_player(self) -> int:
        return self._current_player

    def is_terminal(self) -> bool:
        return self._is_terminal

    def legal_actions(self) -> List[Action]:
        if self.is_terminal(): return []
        actions = []
        player_id = self.current_player()
        hand = self.player_hands[player_id]
        forest = self.player_forests[player_id]
        
        if len(hand) < 10 and self.deck:
            actions.append(Action(ActionType.DRAW_FROM_DECK))
            
        if len(hand) < 10 and self.clearing:
            for cid in self.clearing:
                actions.append(Action(ActionType.DRAW_FROM_CLEARING, target_id=cid))
                
        for cid in hand:
            card_def = CARD_DB[cid]
            if card_def['category'] == 'woodyPlant':
                if len(hand) - 1 >= card_def['cost']:
                    actions.append(Action(ActionType.PLAY_TREE, target_id=cid))
            elif card_def['category'] == 'dweller':
                valid_side = card_def['position']
                if valid_side != 'NONE':
                    for tree_idx in forest.get_available_slots(valid_side):
                        if len(hand) - 1 >= card_def['cost']:
                            actions.append(Action(ActionType.PLAY_CARD, target_id=cid, side=valid_side, tree_index=tree_idx))
        return actions

    def apply_action(self, action: Action):
        player_id = self.current_player()
        
        if action.action_type == ActionType.DRAW_FROM_DECK:
            self._draw_from_deck(player_id)
            
        elif action.action_type == ActionType.DRAW_FROM_CLEARING:
            self.clearing.remove(action.target_id)
            self.player_hands[player_id].append(action.target_id)
            
        elif action.action_type == ActionType.PLAY_TREE:
            # Payment logic omitted for simplicity of skeleton, assume random pop for non-spec
            self._pay_cost(player_id, action.target_id)
            self.player_forests[player_id].add_tree(action.target_id)
            self.player_hands[player_id].remove(action.target_id)
            self._force_draw_to_clearing()
            
        elif action.action_type == ActionType.PLAY_CARD:
            self._pay_cost(player_id, action.target_id)
            tree = self.player_forests[player_id].trees[action.tree_index]
            tree.attach(action.target_id, action.side)
            self.player_hands[player_id].remove(action.target_id)
            
        if len(self.clearing) >= 10:
            self.clearing.clear()
            
        self._current_player = (player_id + 1) % self.num_players
        
    def _draw_from_deck(self, player_id: int):
        if not self.deck: return
        card = self.deck.pop()
        # Winter cards inject trigger logic needed here 
        self.player_hands[player_id].append(card)

    def _force_draw_to_clearing(self):
        if not self.deck: return
        card = self.deck.pop()
        self.clearing.append(card)

    def _pay_cost(self, player_id: int, playing_card_id: int):
        cost = CARD_DB[playing_card_id]['cost']
        hand = self.player_hands[player_id]
        # Very stripped down: just dumps first N valid cards to clearing
        # In reality, this needs color matching and regression action steps
        available_payments = [c for c in hand if c != playing_card_id]
        for _ in range(cost):
            c = available_payments.pop(0)
            hand.remove(c)
            self.clearing.append(c)

    def returns(self) -> List[float]:
        if not self.is_terminal():
            return [0.0 for _ in range(self.num_players)]
            
        payload = {
            "id": "game1",
            "gameBoxes": ["BASE", "ALPINE", "WOODLAND_EDGE"], 
            "deck": {"caves": [], "dwellers": [], "woodyPlants": []}, 
            "players": [
                {
                    "id": str(i), 
                    "name": f"P{i}", 
                    "forest": self.player_forests[i].to_typescript_json()
                } for i in range(self.num_players)
            ]
        }
        
        try:
            resp = requests.post("http://localhost:3055/score", json=payload)
            data = resp.json()
            scores = [0.0] * self.num_players
            for p_score in data.get("players", []):
                scores[int(p_score["playerId"])] = float(p_score["total"])
            return scores
        except Exception as e:
            print(f"Scoring API error: {e}")
            return [0.0] * self.num_players
