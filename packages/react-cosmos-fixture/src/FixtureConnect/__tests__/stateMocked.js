// @flow

import React, { Component } from 'react';
import until from 'async-until';
import { StateMock } from '@react-mock/state';
import {
  getStateFixtureState,
  updateStateFixtureState
} from 'react-cosmos-shared2/fixtureState';
import { uuid } from '../../shared/uuid';
import { mockConnect as mockPostMessage } from '../jestHelpers/postMessage';
import { mockConnect as mockWebSockets } from '../jestHelpers/webSockets';
import { mount } from '../jestHelpers/mount';

import type { ElementRef } from 'react';

class Counter extends Component<{}, { count: number }> {
  state = { count: 0 };

  render() {
    const { count } = this.state;

    return typeof count === 'number' ? `${count} times` : 'Missing count';
  }
}

class CoolCounter extends Component<{}, { count: number }> {
  state = { count: 0 };

  render() {
    return `${this.state.count} timez`;
  }
}

const rendererId = uuid();
const fixtures = {
  first: (
    <StateMock state={{ count: 5 }}>
      <Counter />
    </StateMock>
  )
};

tests(mockPostMessage);
tests(mockWebSockets);

function tests(mockConnect) {
  it('captures mocked state', async () => {
    await mockConnect(async ({ getElement, selectFixture, untilMessage }) => {
      await mount(getElement({ rendererId, fixtures }), async renderer => {
        await selectFixture({
          rendererId,
          fixturePath: 'first'
        });

        expect(renderer.toJSON()).toBe('5 times');

        await untilMessage({
          type: 'fixtureState',
          payload: {
            rendererId,
            fixturePath: 'first',
            fixtureState: {
              props: [getEmptyPropsInstanceShape()],
              state: [getStateInstanceShape(5)]
            }
          }
        });
      });
    });
  });

  it('overwrites mocked state', async () => {
    await mockConnect(
      async ({
        getElement,
        selectFixture,
        lastFixtureState,
        setFixtureState
      }) => {
        await mount(getElement({ rendererId, fixtures }), async renderer => {
          await selectFixture({
            rendererId,
            fixturePath: 'first'
          });

          const fixtureState = await lastFixtureState();
          const [{ decoratorId, elPath }] = getStateFixtureState(fixtureState);
          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: updateStateFixtureState({
                fixtureState,
                decoratorId,
                elPath,
                values: [createCountStateValue(100)]
              })
            }
          });

          expect(renderer.toJSON()).toBe('100 times');

          // A second update will provide code coverage for a different branch:
          // the transition between fixture state values
          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: updateStateFixtureState({
                fixtureState,
                decoratorId,
                elPath,
                values: [createCountStateValue(200)]
              })
            }
          });

          expect(renderer.toJSON()).toBe('200 times');
        });
      }
    );
  });

  it('removes mocked state property', async () => {
    await mockConnect(
      async ({
        getElement,
        selectFixture,
        lastFixtureState,
        setFixtureState
      }) => {
        await mount(getElement({ rendererId, fixtures }), async renderer => {
          await selectFixture({
            rendererId,
            fixturePath: 'first'
          });

          const fixtureState = await lastFixtureState();
          const [{ decoratorId, elPath }] = getStateFixtureState(fixtureState);
          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: updateStateFixtureState({
                fixtureState,
                decoratorId,
                elPath,
                values: []
              })
            }
          });

          expect(renderer.toJSON()).toBe('Missing count');
        });
      }
    );
  });

  it('reverts to mocked state', async () => {
    await mockConnect(
      async ({
        getElement,
        selectFixture,
        untilMessage,
        lastFixtureState,
        setFixtureState
      }) => {
        await mount(getElement({ rendererId, fixtures }), async renderer => {
          await selectFixture({
            rendererId,
            fixturePath: 'first'
          });

          const fixtureState = await lastFixtureState();
          const [{ decoratorId, elPath }] = getStateFixtureState(fixtureState);
          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: updateStateFixtureState({
                fixtureState,
                decoratorId,
                elPath,
                values: [createCountStateValue(10)]
              })
            }
          });

          expect(renderer.toJSON()).toBe('10 times');

          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: []
            }
          });

          expect(renderer.toJSON()).toBe('5 times');

          await untilMessage({
            type: 'fixtureState',
            payload: {
              rendererId,
              fixturePath: 'first',
              fixtureState: {
                props: [getEmptyPropsInstanceShape()],
                state: [getStateInstanceShape(5)]
              }
            }
          });
        });
      }
    );
  });

  it('captures component state changes', async () => {
    const timeout = 1000;
    let counterRef: ?ElementRef<typeof Counter>;

    const fixtures = {
      first: (
        <StateMock state={{ count: 5 }}>
          <Counter
            ref={elRef => {
              if (elRef) {
                counterRef = elRef;
              }
            }}
          />
        </StateMock>
      )
    };

    await mockConnect(
      async ({ getElement, selectFixture, lastFixtureState }) => {
        await mount(getElement({ rendererId, fixtures }), async () => {
          await selectFixture({
            rendererId,
            fixturePath: 'first'
          });

          await until(() => counterRef, { timeout });
          if (!counterRef) {
            throw new Error('Counter ref missing');
          }

          counterRef.setState({ count: 7 });
          try {
            await until(async () => (await getCount()) === 7, { timeout });
          } catch (err) {
            expect(await getCount()).toBe(7);
          }

          // Simulate a small pause between updates
          await new Promise(res => setTimeout(res, 500));

          counterRef.setState({ count: 13 });
          try {
            await until(async () => (await getCount()) === 13, { timeout });
          } catch (err) {
            expect(await getCount()).toBe(13);
          }
        });

        async function getCount() {
          const fixtureState = await lastFixtureState();
          const [{ values }] = getStateFixtureState(fixtureState);

          return JSON.parse(values[0].stringified);
        }
      }
    );
  });

  it('applies fixture state to replaced component type', async () => {
    await mockConnect(
      async ({
        getElement,
        selectFixture,
        lastFixtureState,
        setFixtureState
      }) => {
        await mount(getElement({ rendererId, fixtures }), async renderer => {
          await selectFixture({
            rendererId,
            fixturePath: 'first'
          });

          const fixtureState = await lastFixtureState();
          const [{ decoratorId, elPath }] = getStateFixtureState(fixtureState);
          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: updateStateFixtureState({
                fixtureState,
                decoratorId,
                elPath,
                values: [createCountStateValue(50)]
              })
            }
          });

          expect(renderer.toJSON()).toBe('50 times');

          renderer.update(
            getElement({
              rendererId,
              fixtures: {
                first: (
                  <StateMock state={{ count: 5 }}>
                    <CoolCounter />
                  </StateMock>
                )
              }
            })
          );

          expect(renderer.toJSON()).toBe('50 timez');
        });
      }
    );
  });

  it('overwrites fixture state on fixture change', async () => {
    await mockConnect(
      async ({
        getElement,
        selectFixture,
        untilMessage,
        lastFixtureState,
        setFixtureState
      }) => {
        await mount(getElement({ rendererId, fixtures }), async renderer => {
          await selectFixture({
            rendererId,
            fixturePath: 'first'
          });

          const fixtureState = await lastFixtureState();
          const [{ decoratorId, elPath }] = getStateFixtureState(fixtureState);
          await setFixtureState({
            rendererId,
            fixturePath: 'first',
            fixtureStateChange: {
              state: updateStateFixtureState({
                fixtureState,
                decoratorId,
                elPath,
                values: [createCountStateValue(6)]
              })
            }
          });

          expect(renderer.toJSON()).toBe('6 times');

          // When the fixture changes, however, the fixture state follows along
          renderer.update(
            getElement({
              rendererId,
              fixtures: {
                first: (
                  <StateMock state={{ count: 50 }}>
                    <Counter />
                  </StateMock>
                )
              }
            })
          );

          await untilMessage({
            type: 'fixtureState',
            payload: {
              rendererId,
              fixturePath: 'first',
              fixtureState: {
                props: [getEmptyPropsInstanceShape()],
                state: [getStateInstanceShape(50)]
              }
            }
          });

          expect(renderer.toJSON()).toBe('50 times');
        });
      }
    );
  });

  it('clears fixture state for removed fixture element', async () => {
    await mockConnect(async ({ getElement, untilMessage, selectFixture }) => {
      await mount(getElement({ rendererId, fixtures }), async renderer => {
        await selectFixture({
          rendererId,
          fixturePath: 'first'
        });

        await untilMessage({
          type: 'fixtureState',
          payload: {
            rendererId,
            fixturePath: 'first',
            fixtureState: {
              props: [getEmptyPropsInstanceShape()],
              state: [getStateInstanceShape(5)]
            }
          }
        });

        renderer.update(
          getElement({
            rendererId,
            fixtures: {
              // Counter element from fixture is gone, and so should the
              // fixture state related to it.
              first: 'No counts for you.'
            }
          })
        );

        expect(renderer.toJSON()).toBe('No counts for you.');

        await untilMessage({
          type: 'fixtureState',
          payload: {
            rendererId,
            fixturePath: 'first',
            fixtureState: {
              props: [],
              state: []
            }
          }
        });
      });
    });
  });
}

function createCountStateValue(count: number) {
  return {
    serializable: true,
    key: 'count',
    stringified: `${count}`
  };
}

function getEmptyPropsInstanceShape() {
  return {
    decoratorId: expect.any(Number),
    elPath: expect.any(String),
    componentName: 'Counter',
    renderKey: expect.any(Number),
    values: []
  };
}

function getStateInstanceShape(count: number) {
  return {
    decoratorId: expect.any(Number),
    elPath: expect.any(String),
    componentName: 'Counter',
    values: [
      {
        serializable: true,
        key: 'count',
        stringified: `${count}`
      }
    ]
  };
}