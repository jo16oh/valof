import { Shape, User } from "./shape.ts";

User.helper.impl({ shout: (u) => u.id });
Shape.Triangle.implSeal((payload, seal) => seal(payload));
