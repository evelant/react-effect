import * as Effect from "@effect/io/Effect"
import * as Fiber from "@effect/io/Fiber"
import * as Runtime from "@effect/io/Runtime"
import * as Stream from "@effect/stream/Stream"
import type { ResultBag } from "effect-react/hooks/useResultBag"
import { updateNext, useResultBag } from "effect-react/hooks/useResultBag"
import type { RuntimeContext } from "effect-react/internal/runtimeContext"
import * as Result from "effect-react/Result"
import { useContext, useEffect, useRef, useState } from "react"

export type UseResult<R> = <R0 extends R, E, A>(
  stream: Stream.Stream<R0, E, A>
) => ResultBag<E, A>

export const makeUseResult: <R>(
  runtimeContext: RuntimeContext<R>
) => UseResult<R> = <R>(runtimeContext: RuntimeContext<R>) =>
  <R0 extends R, E, A>(stream: Stream.Stream<R0, E, A>) => {
    const runtime = useContext(runtimeContext)
    const fiberRef = useRef<Fiber.RuntimeFiber<E, void>>()
    const firstTimeRef = useRef(true)
    const [result, setResult] = useState<Result.Result<E, A>>(Result.waiting(Result.initial()))
    const [trackRef, resultBag] = useResultBag(result)
    if (!fiberRef.current) {
      fiberRef.current = stream.pipe(
        Stream.tap((value) =>
          Effect.sync(() => {
            setResult(updateNext(Result.success(value), trackRef))
          })
        ),
        Stream.tapErrorCause((cause) =>
          Effect.sync(() => {
            setResult(updateNext(Result.failCause(cause), trackRef))
          })
        ),
        Stream.runDrain,
        Runtime.runFork(runtime)
      )
    }

    useEffect(() => {
      if (!firstTimeRef.current) {
        fiberRef.current = stream.pipe(
          Stream.tap((value) =>
            Effect.sync(() => {
              setResult(updateNext(Result.success(value), trackRef))
            })
          ),
          Stream.tapErrorCause((cause) =>
            Effect.sync(() => {
              setResult(updateNext(Result.failCause(cause), trackRef))
            })
          ),
          Stream.runDrain,
          Runtime.runFork(runtime)
        )
      }
      firstTimeRef.current = false
      return () => {
        if (fiberRef.current) {
          Effect.runSync(Fiber.interruptFork(fiberRef.current))
        }
      }
    }, [runtime, stream])

    trackRef.current.currentStatus = result._tag
    return resultBag
  }
