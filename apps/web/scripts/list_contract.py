"""Compile reviewed content semantics, never infer a task boundary from whitespace."""
RULES = {
    'descriptive-list': {'layout': 'together', 'progression': 'auto'},
    'explanation': {'layout': 'together', 'progression': 'auto'},
    'discussion': {'layout': 'separate', 'progression': 'confirm'},
    'action': {'layout': 'separate', 'progression': 'confirm'},
    'media': {'layout': 'separate', 'progression': 'authored'},
}

def source_lists(guide):
    lists = []
    for step in guide['steps']:
        units = step['units']
        for i, unit in enumerate(units):
            if unit['tag'] != 'li' or (i and units[i-1]['tag'] == 'li'):
                continue
            assert i, 'List has no introduction; review its structure'
            items = []
            for item in units[i:]:
                if item['tag'] != 'li':
                    break
                items.append(item)
            lists.append((units[i-1], items))
    return lists

def compile_lists(guide, plan, activities):
    assert plan['version'] == 1, 'Unsupported list contract version'
    discovered = source_lists(guide)
    assert len(plan['lists']) == len(discovered), 'Unreviewed or removed source list'
    records = {row['introId']: row for row in plan['lists']}
    assert len(records) == len(discovered), 'Duplicate list classification'
    by_id = {a['id']: a for a in activities}
    positions = {a['id']: i for i, a in enumerate(activities)}
    compiled = []
    for intro, items in discovered:
        row = records.get(intro['id'])
        assert row, 'Unreviewed list: ' + intro['id']
        members = [intro, *items]
        assert row['sourceHashes'] == {u['id']: u['sha256'] for u in members}, 'List changed; review ' + intro['id']
        assert row['purpose'] in RULES and row['reason'].strip(), 'Missing content classification'
        rule = RULES[row['purpose']]
        beats = [by_id[u['id']] for u in members]
        if rule['layout'] == 'together':
            assert all(a['completion'] == 'auto' and not a.get('assetId') and not a.get('relatedAssetIds') for a in beats), 'Grouping would swallow a pause or media cue'
            indices = [positions[a['id']] for a in beats]
            assert indices == list(range(indices[0], indices[0]+len(indices))), 'Grouping would swallow inserted content'
            for activity in beats:
                activity['readingGroupId'] = intro['id']
        elif rule['progression'] == 'confirm':
            assert all(a['completion'] == 'confirm' for a in beats[1:]), 'Interactive list item must wait for a response'
        compiled.append({
            'id': intro['id'], 'purpose': row['purpose'], **rule,
            'introId': intro['id'], 'itemIds': [u['id'] for u in items],
            'reason': row['reason'],
            'narration': [{'activityId': a['id'], 'audioId': a.get('audioId'),
                           'audioSrc': a.get('audioSrc'), 'completion': a['completion']} for a in beats],
        })
    return compiled
