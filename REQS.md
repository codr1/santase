# Requirements

<!--
REQS.md is your unstructured requirements backlog.
Write features, bugs, and ideas here in any format.

When you run `wf plan`, Claude analyzes this file and proposes stories.
Sections get marked with WIP tags when stories are created, and
removed when stories are merged.

Examples:
- User authentication with OAuth
- Fix: logout button doesn't work on mobile
- Add dark mode support
-->

  

RULESET 1:

The main objective of the game is to be the first one to score 11 win points. You win points by winning a round. The first player to reach 66 points in a round and to declare it is the winner of the hand.




You are not required to follow suit until all cards of the talon are dealt.

You are required to follow suit once the undealt cards are closed.

A player may close the talon if he believes that the cards in his hand are strong enough to win the remaining tricks and reach 66 points. During this time the players must follow suit if possible, otherwise trump.

<!-- BEGIN WIP: STORY-0006 -->
The player who holds the lowest trump card (the 9) could exchange it for the trump that is turned up during his turn to lead.

The exchange could occur as long as there are more than 2 cards remaining in the talon.
<!-- END WIP -->

If a player believes that he has 66 points and declares it (only after winning a trick or after matching pairs of K and Q), the play stops immediately.

If the player is right and has more than 66 points, he wins the hand. Otherwise, points are distributed to the opponent instead.

Winning a round gives you:

3 points if the opponent has 0 tricks won
2 points if the opponent’s score is below 33
1 point if the opponent’s score is 33 or more

--- 

RULESET 2:
Santase Rules

Santase is not a commonly played card game but it is a lot of fun. This two-player game, popular in Eastern Europe, is challenging and competitive. Give it a try.


Decide who leads by gentleman's agreement or any means you like. This player will lay down a card. The opponent will do then do the same. 


<!-- BEGIN WIP: STORY-0006 -->
Another oddball rule in Santase is that concerns the trump 9. If you have the 9 of the trump suit you can swap it for the overturned trump card in the middle of the table at the start of your turn.
<!-- END WIP -->

Play continues until the stock pile is exhausted. Now the rules change somewhat. One player will lead. The other player must follow with a card of the same suit. If they do not have one, they must play a trump card (if they have one).

Remember, the object of the game is to be the first to get to 66 points, or be the player to win the final trick.


Here's one more complicating rule. At any point in the game, while the stock pile still has cards in inventory, a player may close the deck. That means players enter the final phase of the game as if the stock pile was exhausted.

If you win the game, you get a point. If your opponent has 30 or less points, you score two. No points scores three.

Keep playing until someone reaches 10 points or any point level you agreed upon in advance.


RULESET 3: 
How to Play Santase
 
santaseSantase (pronounced SAN-tah-say) is a two-person card game that’s popular in Bulgaria. The Santase rules are a little tricky but, once learned, the game is highly addictive. The card game rules are similar to those used in 66, and an Austrian game called Schnapsen.

Number of Players
Santase is a card game for 2 people.

Goal
The goal is to be the first player to score 66 points. Or, if neither player scores 66 points, the player to take the final card wins.

Dealing

Decide who goes first. After the first deal, the loser of the previous hand deals and the winner lays down the first card.

Playing


Kings and Queens

Exchanging the 9
<!-- BEGIN WIP: STORY-0006 -->
If you have the 9 of the trump suit in your hand you may exchange it for the displayed trump card. But only if you are leading the turn, and only at the start of your turn.
<!-- END WIP -->

The Run-off
Once no more cards are available in the deck, play proceeds a little differently. The player who won the last hand lays down first. If the other player has a card of the same suit they must play it. If they do not, they must play a card from the trump suit if they have one. As before, play continues until one player scores 66 points or more, or all cards have been taken.

Card Scoring

Closing the Deck
At any point in the game, provided there are at least 3 cards remaining in the deck plus the displayed trump card, a player may close the deck. To do this, turn over the displayed trump card. You must do this at the start of your turn and you must be leading (laying down first). Then the game proceeds as in the “run-off”. There is danger in this play. If the player who closed does not score 66 points, the other player scores 3 points for the win.

Game Scoring
The player who wins the game scores one point. If the loser has fewer than 31 points (30 or less), the winner scores two points. If the loser has scored no points, the winner scores three.

Games are played to any point value the players agree on. Typically, the first person to reach 11 points wins.
