const held = { loud: (a) => a.name };
const A = Val.companion<A>().impl(() => held).build();

const members = () => ({ quiet: (b) => b.name });
const B = Val.companion<B>().impl(members).build();

const C = Val.companion<C>()
  .impl(() => {
    return { hidden: (c) => c.name };
  })
  .build();
