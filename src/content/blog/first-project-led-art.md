---
title: 'Your first project: animated LED art'
description: 'A 10-minute starter project — paint a glowing heart on the 5×5 RGB matrix and make it pulse.'
pubDate: 2026-05-26
author: 'Bitsflow Team'
tags: ['tutorial', 'beginner']
---

Let's make the matrix glow. This works in the block editor or MicroPython — here's
the Python version.

## Draw a heart

```python
from bitsflow import display, Color
import time

heart = [
    (1,0),(3,0),
    (0,1),(2,1),(4,1),
    (0,2),(4,2),
    (1,3),(3,3),
    (2,4),
]

while True:
    for b in range(20, 100, 5):
        for x, y in heart:
            display.set_pixel(x, y, Color.RED, brightness=b)
        time.sleep(0.03)
```

## What you learned

- Setting individual pixels with `set_pixel`
- Using brightness to create a **pulse** effect
- The basic animation loop

Next up: reading the accelerometer to make your art react to motion.
