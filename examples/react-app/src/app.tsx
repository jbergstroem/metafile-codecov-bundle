import { useState } from "react";

export const App = () => {
	const [count, setCount] = useState(0);
	return (
		<div>
			<h1>Counter: {count}</h1>
			<button type="button" onClick={() => setCount((c) => c + 1)}>
				Increment
			</button>
		</div>
	);
};
