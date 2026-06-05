"""
Koan — classical zen koan library.

Used only by the Sunday "Today" card. These are genuine traditional koans,
rendered as a single brief pointing line (or a one-line master exchange).
They are presented without commentary — the silent classical register.

Selection favours koans whose pointing power survives translation and the
absence of doctrinal context. Attribution: "Master · century" in words,
English spellings (Joshu, not Zhaozhou; Linji, not Rinzai).
"""

CLASSICAL_KOANS = [
    {
        "id": "joshu_wash_bowl",
        "text": "Have you eaten your rice? Then wash your bowl.",
        "attribution": "Joshu · ninth century",
    },
    {
        "id": "joshu_cypress_tree",
        "text": "Why did the patriarch come from the west? The cypress tree in the garden.",
        "attribution": "Joshu · ninth century",
    },
    {
        "id": "joshu_drink_tea",
        "text": "New here, or returning? Either way — go and drink your tea.",
        "attribution": "Joshu · ninth century",
    },
    {
        "id": "joshu_not_difficult",
        "text": "The great Way is not difficult; it only avoids picking and choosing.",
        "attribution": "Joshu · ninth century",
    },
    {
        "id": "nansen_ordinary_mind",
        "text": "Ordinary mind is the Way.",
        "attribution": "Nansen · ninth century",
    },
    {
        "id": "mazu_this_mind",
        "text": "What is Buddha? This very mind.",
        "attribution": "Mazu · eighth century",
    },
    {
        "id": "tozan_three_pounds",
        "text": "What is Buddha? Three pounds of flax.",
        "attribution": "Tozan · tenth century",
    },
    {
        "id": "yunmen_good_day",
        "text": "Every day is a good day.",
        "attribution": "Yunmen · tenth century",
    },
    {
        "id": "hakuin_one_hand",
        "text": "Two hands clap and there is a sound. What is the sound of one hand?",
        "attribution": "Hakuin · eighteenth century",
    },
    {
        "id": "bodhidharma_dont_know",
        "text": "Who stands before me? I do not know.",
        "attribution": "Bodhidharma · sixth century",
    },
    {
        "id": "linji_true_person",
        "text": "A true person of no rank goes in and out through the gates of your face.",
        "attribution": "Linji · ninth century",
    },
    {
        "id": "gutei_one_finger",
        "text": "Whatever he was asked, Gutei raised a single finger.",
        "attribution": "Gutei · ninth century",
    },
    {
        "id": "wumen_seasons",
        "text": "A hundred flowers in spring, the moon in autumn. A mind without clouds — the finest of seasons.",
        "attribution": "Wumen · thirteenth century",
    },
    {
        "id": "pang_carry_water",
        "text": "How wondrous this, how mysterious: I carry fuel, I draw water.",
        "attribution": "Layman Pang · eighth century",
    },
    {
        "id": "hakuin_near",
        "text": "Not knowing how near the truth is, people seek it far away.",
        "attribution": "Hakuin · eighteenth century",
    },
]


def koan_for_week(user_id: str, iso_week: int) -> dict:
    """
    Deterministic per-user, per-week selection.

    A stable hash of the user_id gives each user a different starting point;
    adding the ISO week number rotates the choice forward by exactly one each
    week, so two consecutive Sundays never return the same koan (the index
    moves by 1 modulo the library length).
    """
    import hashlib

    n = len(CLASSICAL_KOANS)
    user_offset = int(hashlib.sha256(user_id.encode("utf-8")).hexdigest(), 16)
    index = (user_offset + iso_week) % n
    return CLASSICAL_KOANS[index]
