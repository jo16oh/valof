const User = Val.companion<User>().impl({
  // valof-lint-disable-next-line
  shout: (u) => u.toUpperCase(),
  whisper: (u) => u.toLowerCase(),
});
