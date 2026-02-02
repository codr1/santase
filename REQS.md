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

<!-- BEGIN WIP: STORY-0001 -->
Build an online version of santase.  I will include the ruleset below.  I am actually going to include several.  Now. I need to be able to join a server.  I will be presented with the option to create a room or join a room.  If I create the room, the server will display a 4 to 6 digit code which I can share with the other player so they can join the room at the same time.  Once both players are in, the game can start.

Our tech stack will be HTMX with as little JS as possible.  The backend will be bun.  No database or persistence at this time.
<!-- END WIP -->  

RULESET 1:

The main objective of the game is to be the first one to score 11 win points. You win points by winning a round. The first player to reach 66 points in a round and to declare it is the winner of the hand.

You acquire points by winning tricks.

Another way to acquire points is by matching pairs of Kings and Queens, which grants you a bonus of 20 or 40 points once declared.

During the deal, three cards are dealt to each player, one card is turned up as a trump, followed by dealing another three cards to each player.

You are not required to follow suit until all cards of the talon are dealt.

You are required to follow suit once the undealt cards are closed.

A player may close the talon if he believes that the cards in his hand are strong enough to win the remaining tricks and reach 66 points. During this time the players must follow suit if possible, otherwise trump.

The player who holds the lowest trump card (the 9) could exchange it for the trump that is turned up during his turn to lead.

The exchange could occur as long as there are more than 2 cards remaining in the talon.

If a player believes that he has 66 points and declares it (only after winning a trick or after matching pairs of K and Q), the play stops immediately.

If the player is right and has more than 66 points, he wins the hand. Otherwise, points are distributed to the opponent instead.

The ranks and values of the cards are as follows:

Ace – 11 points
Ten – 10 points
King – 4 points
Queen – 3 points
Jack – 2 points
9 – 0 points
Winning a round gives you:

3 points if the opponent has 0 tricks won
2 points if the opponent’s score is below 33
1 point if the opponent’s score is 33 or more

--- 

RULESET 2:
Santase Rules

Santase is not a commonly played card game but it is a lot of fun. This two-player game, popular in Eastern Europe, is challenging and competitive. Give it a try.

Santase only uses 24 cards from the deck, 9 and up. Get rid of all the other cards. You don't need them.

Each player receives 6 cards. The top card from the remaining cards in the deck is turned over to determine the trump suit.

Decide who leads by gentleman's agreement or any means you like. This player will lay down a card. The opponent will do then do the same. High card (or any card of trump suit) takes the cards and accumulates and resulting points.

Then each player takes a card from the unused deck (the stock pile).

Now here's where things get a little tricky. If you have the king and queen of the same suit, you may lay it down and collect 20 points immediately. If they king and queen belong to the trump suit you score a quick 40 points. This is a big chunk of points since you only need 66 points to win the game.

Note that you don't leave both cards on the table. Leave the queen (the lower card) and take back the king. But you do need to show it, obviously, to your opponent to confirm the points.

Another oddball rule in Santase is that concerns the trump 9. If you have the 9 of the trump suit you can swap it for the overturned trump card in the middle of the table at the start of your turn.

Play continues until the stock pile is exhausted. Now the rules change somewhat. One player will lead. The other player must follow with a card of the same suit. If they do not have one, they must play a trump card (if they have one).

Remember, the object of the game is to be the first to get to 66 points, or be the player to win the final trick.

So how do you score points? Well, you score points (in addition to the king-queen play previously mentioned) according to these rules:

9's = 0 points
J = 2 points
Q = 3 points
K = 4 points
10's = 10 points
A = 11 points

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
Remove the 2’s, 3’s, 4’s, 5’s, 6’s, 7’s, and 8’s from the deck. You will only use the 9’s, 10’s, J’s, Q’s, K’s, and Aces (24 cards, all suits).

Deal 6 cards to each player. Flip over one card. That is the trump suit.

Decide who goes first. After the first deal, the loser of the previous hand deals and the winner lays down the first card.

Playing
One player plays a card, then the other player plays a card. High card of the same suit takes the cards. Aces are high. Alternatively, any card of the trump suit takes any card of another suit.

Each player then draws one card from the remaining cards in the deck. Winner draws first.

Kings and Queens
If you have the king and queen of the same suit, you may show it and score 20 points. King and queen of the trump suit scores 40. You may only do this if you are leading the turn (laying down first). Do it at the start of your turn. Leave the queen down and take back the king.

Exchanging the 9
If you have the 9 of the trump suit in your hand you may exchange it for the displayed trump card. But only if you are leading the turn, and only at the start of your turn.

The Run-off
Once no more cards are available in the deck, play proceeds a little differently. The player who won the last hand lays down first. If the other player has a card of the same suit they must play it. If they do not, they must play a card from the trump suit if they have one. As before, play continues until one player scores 66 points or more, or all cards have been taken.

Card Scoring
In Santase, cards have the following values. Note that a ten is more powerful than a jack, queen or king. In other words, a ten takes a jack, queen or king.

9’s = 0 points
J = 2 points
Q = 3 points
K = 4 points
10’s = 10 points
A = 11 points

Closing the Deck
At any point in the game, provided there are at least 3 cards remaining in the deck plus the displayed trump card, a player may close the deck. To do this, turn over the displayed trump card. You must do this at the start of your turn and you must be leading (laying down first). Then the game proceeds as in the “run-off”. There is danger in this play. If the player who closed does not score 66 points, the other player scores 3 points for the win.

Game Scoring
The player who wins the game scores one point. If the loser has fewer than 31 points (30 or less), the winner scores two points. If the loser has scored no points, the winner scores three.

Games are played to any point value the players agree on. Typically, the first person to reach 11 points wins.
